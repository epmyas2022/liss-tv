import React from 'react';

interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

export function Spinner({ size = 'md', className = '' }: SpinnerProps) {
  const sizeClasses = {
    sm: 'w-6 h-6 border-2',
    md: 'w-10 h-10 border-4',
    lg: 'w-16 h-16 border-4',
    xl: 'w-20 h-20 border-[5px]',
  };

  return (
    <div
      className={`rounded-full border-white/10 animate-spin ${sizeClasses[size]} ${className}`}
      style={{ borderTopColor: '#EA1C25' }}
    />
  );
}
