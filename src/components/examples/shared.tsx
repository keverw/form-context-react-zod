import React from 'react';
import { useFormContext } from '../../lib/form-context';
import { Loader2, AlertTriangle, type LucideIcon } from 'lucide-react';

export const LoadingSpinner = ({ className = '' }: { className?: string }) => (
  <Loader2 className={`animate-spin ${className}`} />
);

export function RootErrors() {
  const form = useFormContext();
  const rootErrors = form.getError([]);

  if (rootErrors.length === 0) return null;

  return (
    <div className="bg-red-50 border-l-4 border-red-400 p-4 mb-4">
      {rootErrors.map((error, index) => (
        <div key={index} className="text-red-700">
          {error.message}
        </div>
      ))}
    </div>
  );
}

export function FormNotice({ type, children }: { type: 'info' | 'warning'; children: React.ReactNode }) {
  const bgColor = type === 'info' ? 'bg-blue-50' : 'bg-yellow-50';
  const borderColor = type === 'info' ? 'border-blue-400' : 'border-yellow-400';
  const textColor = type === 'info' ? 'text-blue-700' : 'text-yellow-700';
  
  return (
    <div className={`${bgColor} border-l-4 ${borderColor} p-4 mb-4`}>
      <div className={`flex items-center ${textColor}`}>
        {type === 'warning' && <AlertTriangle className="w-5 h-5 mr-2" />}
        {children}
      </div>
    </div>
  );
}

export function SubmitButton() {
  const form = useFormContext();
  
  return (
    <button
      type="submit"
      disabled={form.isSubmitting}
      className="flex items-center justify-center w-full px-4 py-2 text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {form.isSubmitting ? (
        <>
          <LoadingSpinner className="w-4 h-4 mr-2" />
          Submitting...
        </>
      ) : (
        'Submit'
      )}
    </button>
  );
}