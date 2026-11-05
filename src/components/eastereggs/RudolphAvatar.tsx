import React from 'react';

interface RudolphAvatarProps {
  displayName?: string;
  initials?: string;
  isCurrentUser?: boolean;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  testId?: string;
  children?: React.ReactNode;
}

export const RudolphAvatar: React.FC<RudolphAvatarProps> = ({
  displayName = 'Du',
  initials = 'DU',
  isCurrentUser = false,
  className = '',
  size = 'md',
  testId,
  children,
}) => {
  const sizeClasses = {
    sm: 'w-8 h-8 text-xs',
    md: 'w-10 h-10 sm:w-11 sm:h-11 text-sm',
    lg: 'w-14 h-14 text-base',
  }[size];

  const resolvedTestId = testId || (isCurrentUser ? 'my-avatar' : 'user-avatar');

  return (
    <div
      data-testid={resolvedTestId}
      title={displayName}
      className={`relative flex items-center justify-center rounded-full select-none ${sizeClasses} ${className}`}
    >
      {/* Avatar Content (Children or default orb face) */}
      {children || (
        <div className="w-full h-full rounded-full flex items-center justify-center font-black tracking-tight bg-gradient-to-tr from-[#003873] to-[#005bb5] text-amber-200 border-2 border-amber-300/60 shadow-md">
          {initials}
        </div>
      )}
    </div>
  );
};
