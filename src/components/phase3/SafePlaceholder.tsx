import React from 'react';
import { SafeVaultContainer, SafeVaultContainerProps } from './SafeVaultContainer';

export const SafePlaceholder: React.FC<SafeVaultContainerProps> = (props) => {
  return <SafeVaultContainer {...props} />;
};

export { SafeVaultContainer };
