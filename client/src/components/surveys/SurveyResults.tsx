import React, { useState, useEffect } from 'react';
import { Alert, AlertDescription } from '../ui/alert';

interface Campaign {
  id: number;
  name: string;
  template_name: string;
  template_id?: number;
  status: string;
  total_recipients: number;
  responses_received: number;
  response_rate: number;
  actual_send_date?: string;
}

interface Response {
  id: number;
  campaign_name: string;
  template_name: string;
  submitted_at: string;
  completion_time_seconds?: number;
  responses: Record<string, any>;
  respondent_type?: string;
  student_age_group?: string;
}

interface QuestionAnalysis {
  question_id: string;
  question_text: string;
  question_type: string;
  response_count: number;
  analysis: {
    rating_average?: number;
    rating_distribution?: Record<string, number>;
    text_responses?: string[];
    choice_distribution?: Record<string, number>;
    nps_score?: number;
    nps_breakdown?: {
      promoters: number;
      passives: number;
      detractors: number;
    };
  };
}

interface TemplateQuestion {
  id: number;
  question_text: string;
  question_type: string;
  order_index: number;
}

interface SurveyResultsProps {
  clubId: number;
  campaignId?: number;
}

const SurveyResults: React.FC<SurveyResultsProps> = ({ clubId, campaignId }) => {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [selectedCampaign, setSelectedCampaign] = useState<number | null>(campaignId || null);
  const [responses, setResponses] = useState<Response[]>([]);
  const [questionAnalysis, setQuestionAnalysis] = useState<QuestionAnalysis[]>([]);
  const [templateQuestions, setTemplateQuestions] = useState<TemplateQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'overview' | 'responses' | 'questions'>('overview');

  useEffect(() => {
    fetchCampaigns();
  }, [clubId]);

  useEffect(() => {
    if (selectedCampaign) {
      fetchResponses();
    }
  }, [selectedCampaign]);

  // Separate useEffect for analyzing questions when responses change
  useEffect(() => {
    if (selectedCampaign && responses.length > 0) {
      analyzeQuestions();
    } else {
      setQuestionAnalysis([]);
    }
  }, [selectedCampaign, responses]);

  const fetchCampaigns = async () => {
    try {
      const response = await fetch(`/api/clubs/${clubId}/survey-campaigns?status=completed`);
      if (response.ok) {
        const data = await response.json();
        const campaignsWithResponses = data.campaigns.filter((c: Campaign) => c.responses_received > 0);
        setCampaigns(campaignsWithResponses);
        
        // Debug log to check campaign structure
        console.log('Campaigns with responses:', campaignsWithResponses);
        
        // If no specific campaign selected, pick the most recent one with responses
        if (!selectedCampaign && campaignsWithResponses.length > 0) {
          const recentCampaign = campaignsWithResponses[0];
          setSelectedCampaign(recentCampaign.id);
        }
      } else {
        throw new Error('Failed to fetch campaigns');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const fetchResponses = async () => {
    if (!selectedCampaign) return;

    try {
      const response = await fetch(`/api/clubs/${clubId}/survey-export`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'responses',
          campaign_ids: [selectedCampaign]
        })
      });

      if (response.ok) {
        const data = await response.json();
        setResponses(data.data || []);
        console.log('Fetched responses:', data.data);
      } else {
        console.error('Failed to fetch responses:', response.status);
        setResponses([]);
      }
    } catch (err) {
      console.error('Failed to fetch responses:', err);
      setResponses([]);
    }
  };

  const fetchTemplateQuestions = async (templateId: number): Promise<TemplateQuestion[]> => {
    try {
      const response = await fetch(`/api/survey-templates/${templateId}`);
      if (response.ok) {
        const data = await response.json();
        return data.template?.questions || [];
      }
    } catch (err) {
      console.error('Failed to fetch template questions:', err);
    }
    return [];
  };

  const analyzeQuestions = async () => {
    if (!selectedCampaign || responses.length === 0) return;

    setAnalyzing(true);
    try {
      // Get campaign details to find template_id
      const campaign = campaigns.find(c => c.id === selectedCampaign);
      if (!campaign) {
        console.error('Campaign not found for analysis');
        setAnalyzing(false);
        return;
      }

      // Fetch template questions if we have a template_id
      let questions: TemplateQuestion[] = [];
      if (campaign.template_id) {
        questions = await fetchTemplateQuestions(campaign.template_id);
        setTemplateQuestions(questions);
      }

      // If we don't have template questions, try to get campaign details
      if (questions.length === 0) {
        try {
          const campaignResponse = await fetch(`/api/survey-campaigns/${selectedCampaign}`);
          if (campaignResponse.ok) {
            const campaignData = await campaignResponse.json();
            const templateId = campaignData.campaign?.template?.id;
            if (templateId) {
              questions = await fetchTemplateQuestions(templateId);
              setTemplateQuestions(questions);
            }
          }
        } catch (err) {
          console.error('Failed to fetch campaign details:', err);
        }
      }

      console.log('Template questions for analysis:', questions);

      // Analyze responses by question
      const analysis: Record<string, QuestionAnalysis> = {};

      responses.forEach(response => {
        Object.entries(response.responses).forEach(([questionId, answer]) => {
          if (!analysis[questionId]) {
            // Find the actual question text from template
            const questionInfo = questions.find(q => 
              q.id.toString() === questionId || 
              q.order_index.toString() === questionId ||
              (q.order_index - 1).toString() === questionId // Try 0-based indexing
            );
            
            analysis[questionId] = {
              question_id: questionId,
              question_text: questionInfo?.question_text || `Question ${questionId}`,
              question_type: questionInfo?.question_type || 'unknown',
              response_count: 0,
              analysis: {}
            };
          }

          analysis[questionId].response_count++;

          // Analyze based on answer type
          if (typeof answer === 'number') {
            // Rating or NPS question
            if (!analysis[questionId].analysis.rating_distribution) {
              analysis[questionId].analysis.rating_distribution = {};
            }
            
            const key = answer.toString();
            analysis[questionId].analysis.rating_distribution[key] = 
              (analysis[questionId].analysis.rating_distribution[key] || 0) + 1;

            // Calculate average
            const values = Object.entries(analysis[questionId].analysis.rating_distribution)
              .map(([val, count]) => parseInt(val) * count);
            const totalCount = Object.values(analysis[questionId].analysis.rating_distribution)
              .reduce((sum, count) => sum + count, 0);
            analysis[questionId].analysis.rating_average = 
              values.reduce((sum, val) => sum + val, 0) / totalCount;

            // NPS calculation for 0-10 scale
            if (answer >= 0 && answer <= 10) {
              if (!analysis[questionId].analysis.nps_breakdown) {
                analysis[questionId].analysis.nps_breakdown = {
                  promoters: 0,
                  passives: 0,
                  detractors: 0
                };
              }

              if (answer >= 9) {
                analysis[questionId].analysis.nps_breakdown.promoters++;
              } else if (answer >= 7) {
                analysis[questionId].analysis.nps_breakdown.passives++;
              } else {
                analysis[questionId].analysis.nps_breakdown.detractors++;
              }

              const breakdown = analysis[questionId].analysis.nps_breakdown;
              const total = breakdown.promoters + breakdown.passives + breakdown.detractors;
              if (total > 0) {
                analysis[questionId].analysis.nps_score = 
                  ((breakdown.promoters - breakdown.detractors) / total) * 100;
              }
            }
          } else if (typeof answer === 'string' && answer.trim() !== '') {
            // Text or choice question
            if (answer.length < 100) {
              // Likely a choice, analyze distribution
              if (!analysis[questionId].analysis.choice_distribution) {
                analysis[questionId].analysis.choice_distribution = {};
              }
              analysis[questionId].analysis.choice_distribution[answer] = 
                (analysis[questionId].analysis.choice_distribution[answer] || 0) + 1;
            } else {
              // Text response
              if (!analysis[questionId].analysis.text_responses) {
                analysis[questionId].analysis.text_responses = [];
              }
              analysis[questionId].analysis.text_responses.push(answer);
            }
          }
        });
      });

      const analysisResults = Object.values(analysis);
      console.log('Question analysis results:', analysisResults);
      setQuestionAnalysis(analysisResults);
    } catch (err) {
      console.error('Failed to analyze questions:', err);
    } finally {
      setAnalyzing(false);
    }
  };

  const exportData = async () => {
    if (!selectedCampaign) return;

    try {
      const response = await fetch(`/api/clubs/${clubId}/survey-export`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'responses',
          campaign_ids: [selectedCampaign]
        })
      });

      if (response.ok) {
        const data = await response.json();
        
        // Convert to CSV and download
        const csvContent = convertToCSV(data.data);
        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `survey-responses-${selectedCampaign}.csv`;
        a.click();
        window.URL.revokeObjectURL(url);
      }
    } catch (err) {
      setError('Failed to export data');
    }
  };

  const convertToCSV = (data: Response[]) => {
    if (data.length === 0) return '';

    // Get all unique question keys
    const allQuestions = new Set<string>();
    data.forEach(response => {
      Object.keys(response.responses).forEach(q => allQuestions.add(q));
    });

    const headers = [
      'Response ID',
      'Campaign',
      'Template',
      'Submitted At',
      'Completion Time (seconds)',
      'Respondent Type',
      'Student Age Group',
      ...Array.from(allQuestions).sort()
    ];

    const rows = data.map(response => [
      response.id,
      response.campaign_name,
      response.template_name,
      response.submitted_at,
      response.completion_time_seconds || '',
      response.respondent_type || '',
      response.student_age_group || '',
      ...Array.from(allQuestions).sort().map(q => response.responses[q] || '')
    ]);

    return [headers, ...rows]
      .map(row => row.map(field => `"${field}"`).join(','))
      .join('\n');
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  };

  const formatDuration = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  };

  if (loading) {
    return (
      <div className="flex justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  const selectedCampaignData = campaigns.find(c => c.id === selectedCampaign);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Survey Results</h2>
          <p className="text-gray-600">Analyze responses and feedback</p>
        </div>
        <div className="flex space-x-3">
          {selectedCampaign && (
            <button
              onClick={exportData}
              className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
            >
              Export Data
            </button>
          )}
        </div>
      </div>

      {error && (
        <Alert className="border-red-200 bg-red-50">
          <AlertDescription className="text-red-700">
            {error}
          </AlertDescription>
        </Alert>
      )}

      {/* Campaign Selector */}
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">Select Campaign</h3>
          <div className="flex space-x-2">
            {['overview', 'responses', 'questions'].map((mode) => (
              <button
                key={mode}
                onClick={() => setViewMode(mode as typeof viewMode)}
                className={`px-3 py-1 text-sm rounded ${
                  viewMode === mode 
                    ? 'bg-blue-100 text-blue-800' 
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                {mode.charAt(0).toUpperCase() + mode.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {campaigns.length === 0 ? (
          <div className="text-center py-8">
            <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v4a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            <h4 className="mt-2 text-sm font-medium text-gray-900">No survey responses yet</h4>
            <p className="mt-1 text-sm text-gray-500">Send some campaigns to start collecting responses</p>
          </div>
        ) : (
          <select
            value={selectedCampaign || ''}
            onChange={(e) => setSelectedCampaign(parseInt(e.target.value))}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Select a campaign</option>
            {campaigns.map((campaign) => (
              <option key={campaign.id} value={campaign.id}>
                {campaign.name} ({campaign.responses_received} responses)
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Results Display */}
      {selectedCampaignData && (
        <div className="space-y-6">
          {/* Overview */}
          {viewMode === 'overview' && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <div className="bg-white border border-gray-200 rounded-lg p-6">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <svg className="h-8 w-8 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" />
                    </svg>
                  </div>
                  <div className="ml-4">
                    <h4 className="text-lg font-semibold text-gray-900">{selectedCampaignData.total_recipients}</h4>
                    <p className="text-sm text-gray-600">Total Recipients</p>
                  </div>
                </div>
              </div>

              <div className="bg-white border border-gray-200 rounded-lg p-6">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <svg className="h-8 w-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <div className="ml-4">
                    <h4 className="text-lg font-semibold text-gray-900">{selectedCampaignData.responses_received}</h4>
                    <p className="text-sm text-gray-600">Responses</p>
                  </div>
                </div>
              </div>

              <div className="bg-white border border-gray-200 rounded-lg p-6">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <svg className="h-8 w-8 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                    </svg>
                  </div>
                  <div className="ml-4">
                    <h4 className="text-lg font-semibold text-gray-900">{selectedCampaignData.response_rate}%</h4>
                    <p className="text-sm text-gray-600">Response Rate</p>
                  </div>
                </div>
              </div>

              <div className="bg-white border border-gray-200 rounded-lg p-6">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <svg className="h-8 w-8 text-yellow-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <div className="ml-4">
                    <h4 className="text-lg font-semibold text-gray-900">
                      {responses.length > 0 
                        ? formatDuration(Math.round(responses.reduce((sum, r) => sum + (r.completion_time_seconds || 0), 0) / responses.length))
                        : 'N/A'
                      }
                    </h4>
                    <p className="text-sm text-gray-600">Avg. Completion</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Individual Responses */}
          {viewMode === 'responses' && (
            <div className="bg-white border border-gray-200 rounded-lg">
              <div className="px-6 py-4 border-b border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900">Individual Responses</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Submitted
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Duration
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Type
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Responses
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {responses.map((response) => (
                      <tr key={response.id}>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {formatDate(response.submitted_at)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {response.completion_time_seconds ? formatDuration(response.completion_time_seconds) : 'N/A'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {response.respondent_type || 'Unknown'}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-500">
                          {Object.keys(response.responses).length} questions answered
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Question Analysis */}
          {viewMode === 'questions' && (
            <div className="space-y-6">
              {/* Debug info */}
              <div className="text-sm text-gray-500 bg-gray-50 p-3 rounded">
                Debug: {responses.length} responses, {questionAnalysis.length} questions analyzed, {templateQuestions.length} template questions loaded
              </div>
              
              {analyzing ? (
                <div className="flex justify-center p-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                </div>
              ) : questionAnalysis.length === 0 ? (
                <div className="text-center py-8">
                  <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v4a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                  <h4 className="mt-2 text-sm font-medium text-gray-900">No question analysis available</h4>
                  <p className="mt-1 text-sm text-gray-500">
                    {responses.length === 0 
                      ? 'No responses to analyze yet' 
                      : 'Unable to load question data. Check if template is properly configured.'}
                  </p>
                </div>
              ) : (
                questionAnalysis.map((question) => (
                  <div key={question.question_id} className="bg-white border border-gray-200 rounded-lg p-6">
                    <h4 className="font-semibold text-gray-900 mb-4">
                      {question.question_text} ({question.response_count} responses)
                    </h4>

                    {/* Rating Analysis */}
                    {question.analysis.rating_average && (
                      <div className="mb-4">
                        <div className="flex items-center space-x-4">
                          <div className="text-2xl font-bold text-blue-600">
                            {question.analysis.rating_average.toFixed(1)}
                          </div>
                          <div className="text-sm text-gray-600">Average Rating</div>
                        </div>
                        {question.analysis.rating_distribution && (
                          <div className="mt-2 space-y-1">
                            {Object.entries(question.analysis.rating_distribution)
                              .sort(([a], [b]) => parseInt(a) - parseInt(b))
                              .map(([rating, count]) => (
                                <div key={rating} className="flex items-center space-x-2">
                                  <span className="w-8 text-sm">{rating}</span>
                                  <div className="flex-1 bg-gray-200 rounded-full h-2">
                                    <div 
                                      className="bg-blue-600 h-2 rounded-full" 
                                      style={{width: `${(count / question.response_count) * 100}%`}}
                                    />
                                  </div>
                                  <span className="text-sm text-gray-600">{count}</span>
                                </div>
                              ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* NPS Analysis */}
                    {question.analysis.nps_score !== undefined && (
                      <div className="mb-4">
                        <div className="flex items-center space-x-4">
                          <div className="text-2xl font-bold text-green-600">
                            {question.analysis.nps_score.toFixed(0)}
                          </div>
                          <div className="text-sm text-gray-600">NPS Score</div>
                        </div>
                        {question.analysis.nps_breakdown && (
                          <div className="mt-2 grid grid-cols-3 gap-4 text-sm">
                            <div className="text-center">
                              <div className="font-medium text-green-600">
                                {question.analysis.nps_breakdown.promoters}
                              </div>
                              <div className="text-gray-600">Promoters</div>
                            </div>
                            <div className="text-center">
                              <div className="font-medium text-yellow-600">
                                {question.analysis.nps_breakdown.passives}
                              </div>
                              <div className="text-gray-600">Passives</div>
                            </div>
                            <div className="text-center">
                              <div className="font-medium text-red-600">
                                {question.analysis.nps_breakdown.detractors}
                              </div>
                              <div className="text-gray-600">Detractors</div>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Choice Distribution */}
                    {question.analysis.choice_distribution && (
                      <div className="mb-4">
                        <h5 className="font-medium text-gray-900 mb-2">Response Distribution</h5>
                        <div className="space-y-2">
                          {Object.entries(question.analysis.choice_distribution)
                            .sort(([, a], [, b]) => b - a)
                            .map(([choice, count]) => (
                              <div key={choice} className="flex items-center space-x-2">
                                <span className="flex-1 text-sm">{choice}</span>
                                <div className="w-24 bg-gray-200 rounded-full h-2">
                                  <div 
                                    className="bg-purple-600 h-2 rounded-full" 
                                    style={{width: `${(count / question.response_count) * 100}%`}}
                                  />
                                </div>
                                <span className="text-sm text-gray-600 w-8">{count}</span>
                              </div>
                            ))}
                        </div>
                      </div>
                    )}

                    {/* Text Responses */}
                    {question.analysis.text_responses && question.analysis.text_responses.length > 0 && (
                      <div>
                        <h5 className="font-medium text-gray-900 mb-2">Text Responses</h5>
                        <div className="space-y-2 max-h-64 overflow-y-auto">
                          {question.analysis.text_responses.slice(0, 10).map((response, index) => (
                            <div key={index} className="bg-gray-50 p-3 rounded text-sm">
                              {response}
                            </div>
                          ))}
                          {question.analysis.text_responses.length > 10 && (
                            <div className="text-sm text-gray-500 italic">
                              ...and {question.analysis.text_responses.length - 10} more responses
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default SurveyResults;