import * as React from "react"

interface AlertProps {
  children: React.ReactNode;
  className?: string;
  variant?: 'default' | 'destructive';
}

interface AlertTitleProps {
  children: React.ReactNode;
  className?: string;
}

interface AlertDescriptionProps {
  children: React.ReactNode;
  className?: string;
}

export function Alert({ children, className = "", variant = "default" }: AlertProps) {
  return (
    <div className={`p-4 rounded-lg border ${variant === 'destructive' ? 'border-red-600 bg-red-50' : ''} ${className}`}>
      {children}
    </div>
  )
}

export function AlertTitle({ children, className = "" }: AlertTitleProps) {
  return <h5 className={`font-medium mb-1 ${className}`}>{children}</h5>
}

export function AlertDescription({ children, className = "" }: AlertDescriptionProps) {
  return <div className={`text-sm ${className}`}>{children}</div>
}