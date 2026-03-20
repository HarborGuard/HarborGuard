import { toast } from 'sonner';

export function copyToClipboard(text: string, label?: string): void {
  navigator.clipboard.writeText(text);
  toast.success(label ? `${label} copied to clipboard` : 'Copied to clipboard');
}
