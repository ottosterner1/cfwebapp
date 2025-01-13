import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import DynamicReportForm from '../components/reports/DynamicReportForm';
import '../index.css';

interface FormData {
  content: Record<string, Record<string, any>>;
  recommendedGroupId: number;
  template_id: number;
}

interface PlayerData {
  studentName: string;
  dateOfBirth: string | null;
  age: number | null;
  groupName: string;
}

interface NextPlayer {
  id: number;
  student_name: string;
  group_name: string;
  group_id: number;
  found_in_same_group: boolean;
}

const CreateReportApp = () => {
  const [template, setTemplate] = useState<any>(null);
  const [playerData, setPlayerData] = useState<PlayerData | null>(null);
  const [nextPlayer, setNextPlayer] = useState<NextPlayer | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

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
        setTemplate(data.template);
        setPlayerData({
          studentName: data.player.studentName,
          dateOfBirth: data.player.dateOfBirth,
          age: data.player.age,
          groupName: data.player.groupName
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

      window.location.href = '/dashboard';
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
        window.location.href = `/report/new/${nextPlayer.id}`;
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

  return (
    <DynamicReportForm
      template={template}
      studentName={playerData.studentName}
      dateOfBirth={playerData.dateOfBirth || undefined}
      age={playerData.age || undefined}
      groupName={playerData.groupName}
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