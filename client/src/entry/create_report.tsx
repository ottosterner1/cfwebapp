import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import DynamicReportForm from '../components/reports/DynamicReportForm';
import '../index.css';

interface FormData {
  content: Record<string, Record<string, any>>;
  recommendedGroupId: number;
  template_id: number;
  is_draft: boolean;
}

interface PlayerData {
  studentName: string;
  dateOfBirth: string | null;
  age: number | null;
  groupName: string;
  sessionInfo?: {
    dayOfWeek?: string;
    startTime?: string;
    endTime?: string;
  };
}

interface NextPlayer {
  id: number;
  student_name: string;
  group_name: string;
  group_id: number;
  found_in_same_group: boolean;
}

interface SubmissionResult {
  message: string;
  report_id: number;
  status: 'draft' | 'submitted';
}

const CreateReportApp = () => {
  const [template, setTemplate] = useState<any>(null);
  const [playerData, setPlayerData] = useState<PlayerData | null>(null);
  const [nextPlayer, setNextPlayer] = useState<NextPlayer | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionResult, setSubmissionResult] = useState<SubmissionResult | null>(null);

  // Get data from the DOM
  const rootElement = document.getElementById('create-report-root');
  const playerId = rootElement?.dataset.playerId;

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch template and current player data
        const response = await fetch(`/api/reports/template/${playerId}`);
        if (!response.ok) throw new Error('Failed to fetch template');
        const data = await response.json();
        
        console.log("API response:", data); // For debugging
        
        setTemplate(data.template);
        setPlayerData({
          studentName: data.player.studentName,
          dateOfBirth: data.player.dateOfBirth,
          age: data.player.age,
          groupName: data.player.groupName,
          sessionInfo: data.player.sessionInfo // Extract sessionInfo from API response
        });
        
        // Fetch next player info
        const nextPlayerResponse = await fetch(`/api/programme-players/next/${playerId}`);
        if (nextPlayerResponse.ok) {
          const nextPlayerData = await nextPlayerResponse.json();
          setNextPlayer(nextPlayerData);
        }
      } catch (err) {
        setError((err as Error).message);
        console.error('Error fetching data:', err);
      } finally {
        setLoading(false);
      }
    };

    if (playerId) {
      fetchData();
    }
  }, [playerId]);

  const handleSubmit = async (data: Record<string, any>) => {
    setIsSubmitting(true);
    try {
      const formData: FormData = {
        content: data.content,
        recommendedGroupId: Number(data.recommendedGroupId),
        template_id: data.template_id,
        is_draft: data.is_draft || false
      };

      const response = await fetch(`/api/reports/create/${playerId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to submit report');
      }

      const result = await response.json();
      setSubmissionResult(result);

      // If not a draft, redirect to dashboard after a short delay
      if (!formData.is_draft) {
        setTimeout(() => {
          window.location.href = '/dashboard';
        }, 1500);
      }
    } catch (err) {
      console.error('Error submitting report:', err);
      throw err;
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSaveAndNext = async (data: Record<string, any>) => {
    setIsSubmitting(true);
    try {
      const formData: FormData = {
        content: data.content,
        recommendedGroupId: Number(data.recommendedGroupId),
        template_id: data.template_id,
        is_draft: data.is_draft || false
      };

      const response = await fetch(`/api/reports/create/${playerId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to submit report');
      }

      // Navigate to next player's report page if available
      if (nextPlayer) {
        window.location.href = `/api/report/new/${nextPlayer.id}`;
      } else {
        window.location.href = '/dashboard';
      }
    } catch (err) {
      console.error('Error submitting report:', err);
      throw err;
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) return <div className="flex justify-center items-center p-8">Loading...</div>;
  if (error) return <div className="text-red-500 p-4">Error: {error}</div>;
  if (!template || !playerData) return <div className="p-4">No data available</div>;

  // Show success message after submission
  if (submissionResult) {
    return (
      <div className="max-w-4xl mx-auto p-6 bg-white rounded-lg shadow">
        <div className={`p-4 mb-4 rounded-lg ${submissionResult.status === 'draft' ? 'bg-amber-50 border border-amber-200' : 'bg-green-50 border border-green-200'}`}>
          <h2 className={`text-xl font-bold ${submissionResult.status === 'draft' ? 'text-amber-700' : 'text-green-700'}`}>
            {submissionResult.status === 'draft' ? 'Report Saved as Draft' : 'Report Submitted Successfully'}
          </h2>
          <p className="mt-2">{submissionResult.message}</p>
        </div>
        
        <div className="mt-6 flex gap-4">
          <a 
            href={`/api/reports/${submissionResult.report_id}`} 
            className={`px-4 py-2 rounded-md ${submissionResult.status === 'draft' ? 'bg-amber-100 text-amber-800' : 'bg-green-100 text-green-800'}`}
          >
            View Report
          </a>
          {submissionResult.status === 'draft' && (
            <a 
              href={`/api/reports/${submissionResult.report_id}/edit`} 
              className="px-4 py-2 bg-blue-100 text-blue-800 rounded-md"
            >
              Continue Editing
            </a>
          )}
          <a 
            href="/dashboard" 
            className="px-4 py-2 bg-gray-100 text-gray-800 rounded-md"
          >
            Back to Dashboard
          </a>
        </div>
      </div>
    );
  }

  return (
    <DynamicReportForm
      template={template}
      studentName={playerData.studentName}
      dateOfBirth={playerData.dateOfBirth || undefined}
      age={playerData.age || undefined}
      groupName={playerData.groupName}
      sessionInfo={playerData.sessionInfo} // Pass sessionInfo to the component
      onSubmit={handleSubmit}
      onCancel={() => window.location.href = '/dashboard'}
      isSubmitting={isSubmitting}
      onSaveAndNext={nextPlayer ? handleSaveAndNext : undefined}
    />
  );
};

const container = document.getElementById('create-report-root');
if (container) {
  const root = createRoot(container);
  root.render(
    <React.StrictMode>
      <CreateReportApp />
    </React.StrictMode>
  );
}