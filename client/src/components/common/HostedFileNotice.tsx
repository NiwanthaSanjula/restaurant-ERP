import { HOSTED_MODE, HOSTED_FILE_MESSAGE } from '../../services/hostedMode';
export default function HostedFileNotice() {
  return HOSTED_MODE ? <p role="note" className="my-3 rounded-lg border border-line bg-surface-raised p-3 text-sm text-muted">{HOSTED_FILE_MESSAGE}</p> : null;
}
