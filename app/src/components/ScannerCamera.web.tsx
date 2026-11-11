/**
 * Web build: no camera scanning (it is optional there). The scan screen shows
 * manual UPC entry only and never renders this component.
 * Same exports as ScannerCamera.tsx.
 */
export const cameraAvailable = false;

export interface ScannerCameraProps {
  onCode: (code: string) => void;
  paused: boolean;
  onManual: () => void;
}

export function ScannerCamera(_props: ScannerCameraProps) {
  return null;
}
