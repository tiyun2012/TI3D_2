import React from 'react';
import * as Lucide from 'lucide-react';

interface IconProps {
  name: keyof typeof Lucide;
  size?: number;
  className?: string;
  strokeWidth?: number;
}

export const Icon: React.FC<IconProps> = ({ name, size = 16, className = "", strokeWidth }) => {
  const IconComponent = Lucide[name] as React.ElementType;
  if (!IconComponent) return null;
  return <IconComponent size={size} className={className} strokeWidth={strokeWidth} />;
};