// Update DashboardStats.tsx to better highlight draft reports
import React from 'react';
import { DashboardMetrics } from '../../types/dashboard';

interface DashboardStatsProps {
  stats: DashboardMetrics;
}

export const DashboardStats: React.FC<DashboardStatsProps> = ({ stats }) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-medium text-gray-900">Total Players</h3>
        <p className="text-3xl font-bold text-blue-600">{stats.totalStudents}</p>
      </div>
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-medium text-gray-900">Submitted Reports</h3>
        <p className="text-3xl font-bold text-green-600">{stats.submittedReports || 0}</p>
        <div className="flex items-center mt-2">
          <div className="w-3 h-3 rounded-full bg-green-500 mr-2"></div>
          <span className="text-sm text-gray-500">finalised</span>
        </div>
      </div>
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-medium text-gray-900">Draft Reports</h3>
        <div className="flex items-baseline">
          <p className="text-3xl font-bold text-indigo-600">{stats.draftReports || 0}</p>
        </div>
        <div className="flex items-center mt-2">
          <div className="w-3 h-3 rounded-full bg-indigo-500 mr-2"></div>
          <span className="text-sm text-gray-500">
            Needs finalising
          </span>
        </div>
      </div>
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-medium text-gray-900">Completion Rate</h3>
        <p className="text-3xl font-bold text-purple-600">{stats.reportCompletion}%</p>
        <div className="mt-2 w-full bg-gray-200 rounded-full h-2.5">
          <div 
            className="bg-purple-600 h-2.5 rounded-full" 
            style={{ width: `${stats.reportCompletion}%` }}
          />
        </div>
        <div className="text-xs text-gray-500 mt-1">
          Based on submitted reports only
        </div>
      </div>
    </div>
  );
};