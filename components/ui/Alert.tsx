import React from 'react';
import { AlertCircle, CheckCircle, Info } from 'lucide-react';

export interface AlertProps {
  type?: 'error' | 'success' | 'info';
  message: string | null;
  className?: string;
}

export function Alert({ type = 'error', message, className = '' }: AlertProps) {
  if (!message) return null;

  // Estilos basados en Netflix (fondo naranja para errores, verde para éxito)
  const isError = type === 'error';
  const isSuccess = type === 'success';
  const isInfo = type === 'info';

  const bgColor = isError ? 'bg-[#e87c03]' : isSuccess ? 'bg-[#2b9044]' : 'bg-[#333333]';
  const Icon = isError ? AlertCircle : isSuccess ? CheckCircle : Info;

  return (
    <div className={`flex items-start gap-3 p-4 rounded-md text-white text-sm animate-in fade-in zoom-in-95 duration-200 ${bgColor} ${className}`}>
      <Icon size={20} className="shrink-0 mt-0.5" />
      <div className="flex-1 font-medium font-poppins leading-relaxed">
        {message}
      </div>
    </div>
  );
}
