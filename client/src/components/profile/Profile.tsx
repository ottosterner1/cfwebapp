import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Alert, AlertDescription } from '../../components/ui/alert';
import { AlertCircle, User, Phone } from 'lucide-react';

interface ProfileData {
  id: number;
  name: string;
  email: string;
  tennis_club?: {
    id: number;
    name: string;
  };
  role: string;
  coach_details?: {
    contact_number?: string;
    emergency_contact_name?: string;
    emergency_contact_number?: string;
  };
}

const Profile = () => {
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [formData, setFormData] = useState({
    contact_number: '',
    emergency_contact_name: '',
    emergency_contact_number: '',
  });

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const response = await fetch('/api/profile');
        if (response.ok) {
          const data = await response.json();
          setProfile(data);
          // Initialize form data with existing values
          if (data.coach_details) {
            setFormData({
              contact_number: data.coach_details.contact_number || '',
              emergency_contact_name: data.coach_details.emergency_contact_name || '',
              emergency_contact_number: data.coach_details.emergency_contact_number || '',
            });
          }
        } else {
          throw new Error('Failed to fetch profile');
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred');
      } finally {
        setLoading(false);
      }
    };

    fetchProfile();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const response = await fetch('/api/profile/details', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      if (response.ok) {
        const updatedData = await response.json();
        setProfile(prev => ({
          ...prev!,
          coach_details: updatedData
        }));
        setEditing(false);
      } else {
        throw new Error('Failed to update profile');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update profile');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive" className="mb-4">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>Failed to load profile: {error}</AlertDescription>
      </Alert>
    );
  }

  if (!profile) return null;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Basic Information */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <User className="w-5 h-5 mr-2" />
            Basic Information
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <p className="text-sm font-medium text-gray-500">Name</p>
              <p className="mt-1">{profile.name}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-500">Email</p>
              <p className="mt-1">{profile.email}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-500">Tennis Club</p>
              <p className="mt-1">{profile.tennis_club?.name || 'Not assigned'}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-500">Role</p>
              <p className="mt-1 capitalize">{profile.role.toLowerCase().replace('_', ' ')}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Contact Information */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center">
              <Phone className="w-5 h-5 mr-2" />
              Contact Information
            </div>
            <button
              onClick={() => setEditing(!editing)}
              className="text-sm text-blue-600 hover:text-blue-800"
            >
              {editing ? 'Cancel' : 'Edit'}
            </button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {editing ? (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Contact Number
                </label>
                <input
                  type="tel"
                  value={formData.contact_number}
                  onChange={(e) => setFormData(prev => ({
                    ...prev,
                    contact_number: e.target.value
                  }))}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Emergency Contact Name
                </label>
                <input
                  type="text"
                  value={formData.emergency_contact_name}
                  onChange={(e) => setFormData(prev => ({
                    ...prev,
                    emergency_contact_name: e.target.value
                  }))}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Emergency Contact Number
                </label>
                <input
                  type="tel"
                  value={formData.emergency_contact_number}
                  onChange={(e) => setFormData(prev => ({
                    ...prev,
                    emergency_contact_number: e.target.value
                  }))}
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                />
              </div>
              <div className="flex justify-end space-x-3">
                <button
                  type="submit"
                  className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700"
                >
                  Save Changes
                </button>
              </div>
            </form>
          ) : (
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <p className="text-sm font-medium text-gray-500">Contact Number</p>
                <p className="mt-1">{profile.coach_details?.contact_number || 'Not set'}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-500">Emergency Contact</p>
                <p className="mt-1">
                  {profile.coach_details?.emergency_contact_name || 'Not set'}
                  {profile.coach_details?.emergency_contact_number && (
                    <span className="block text-sm text-gray-500">
                      {profile.coach_details.emergency_contact_number}
                    </span>
                  )}
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default Profile;