import { RENOVATION_MODEL } from './renovation-standard.js';
export const QUEUED_MODEL = `oauth-queued:${RENOVATION_MODEL}`;
export const RUNNING_MODEL = `oauth-running:${RENOVATION_MODEL}`;
export const COMPLETED_MODEL = `oauth:${RENOVATION_MODEL}`;
/** @param {{status:string, model?:string}} row */
export function renderingPhase(row) {
	if (row.status !== 'processing') return row.status;
	return row.model === QUEUED_MODEL ? 'queued' : 'processing';
}
