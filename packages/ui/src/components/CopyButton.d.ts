import { ComponentType } from 'react';

interface CopyButtonProps {
   text: string;
   className?: string;
}

declare const CopyButton: ComponentType<CopyButtonProps>;
export default CopyButton;
