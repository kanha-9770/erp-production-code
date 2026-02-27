'use client';

import { useSearchParams, useRouter } from 'next/navigation';
import { Shield, ArrowLeft, Home, AlertTriangle } from 'lucide-react';
import { Suspense } from 'react';

function UnauthorizedContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const reason = searchParams.get('reason') || 'access_denied';
  const module = searchParams.get('module');

  const getReasonInfo = () => {
    switch (reason) {
      case 'admin_required':
        return {
          title: 'Admin Access Required',
          description: 'This page requires administrator privileges to access.',
          icon: Shield,
          color: 'text-red-600',
          bgColor: 'bg-red-50',
        };
      case 'module_access':
        return {
          title: 'Module Access Denied',
          description: module 
            ? `You don't have permission to access the "${module}" module.`
            : 'You don\'t have permission to access this module.',
          icon: AlertTriangle,
          color: 'text-orange-600',
          bgColor: 'bg-orange-50',
        };
      case 'permission_check_failed':
        return {
          title: 'Permission Check Failed',
          description: 'Unable to verify your permissions. Please try again or contact support.',
          icon: AlertTriangle,
          color: 'text-yellow-600',
          bgColor: 'bg-yellow-50',
        };
      default:
        return {
          title: 'Access Denied',
          description: 'You don\'t have permission to access this resource.',
          icon: Shield,
          color: 'text-gray-600',
          bgColor: 'bg-gray-50',
        };
    }
  };

  const reasonInfo = getReasonInfo();
  const Icon = reasonInfo.icon;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
          {/* Icon */}
          <div className={`mx-auto flex items-center justify-center h-16 w-16 rounded-full ${reasonInfo.bgColor} mb-6`}>
            <Icon className={`h-8 w-8 ${reasonInfo.color}`} />
          </div>

          {/* Content */}
          <div className="text-center">
            <h1 className="text-2xl font-bold text-gray-900 mb-4">
              {reasonInfo.title}
            </h1>
            <p className="text-gray-600 mb-8">
              {reasonInfo.description}
            </p>

            {/* Actions */}
            <div className="space-y-3">
              <button
                onClick={() => router.back()}
                className="w-full flex justify-center items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Go Back
              </button>
              
              <button
                onClick={() => router.push('/dashboard')}
                className="w-full flex justify-center items-center px-4 py-2 border border-transparent rounded-md shadow-sm bg-indigo-600 text-sm font-medium text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
              >
                <Home className="h-4 w-4 mr-2" />
                Go to Dashboard
              </button>
            </div>

            {/* Additional info for specific cases */}
            {reason === 'admin_required' && (
              <div className="mt-6 p-4 bg-blue-50 rounded-md">
                <p className="text-sm text-blue-800">
                  If you believe you should have admin access, please contact your system administrator.
                </p>
              </div>
            )}

            {reason === 'module_access' && (
              <div className="mt-6 p-4 bg-blue-50 rounded-md">
                <p className="text-sm text-blue-800">
                  To request access to this module, please contact your administrator or submit a request through the proper channels.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function UnauthorizedPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    }>
      <UnauthorizedContent />
    </Suspense>
  );
}