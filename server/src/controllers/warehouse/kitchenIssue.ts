import { Response } from 'express';
import { AuthRequest } from '../../middleware/auth';
import { KitchenIssueError, kitchenIssueOptions, saveKitchenIssueConversion, previewKitchenIssue, postKitchenIssue } from '../../services/kitchenIssue';

function rejected(res: Response, error: unknown) {
  if (error instanceof KitchenIssueError) res.status(error.status).json({ status: 'error', message: error.message, code: error.code });
  else res.status(503).json({ status: 'error', code: 'unconfirmed', message: 'Could not confirm this operation. Retry the same request or review issue history before starting another.' });
}
export async function getKitchenIssueOptions(req: AuthRequest, res: Response): Promise<void> {
  try { res.json({ status: 'success', data: await kitchenIssueOptions(req.params.id, String(req.query.productId || ''), String(req.user!._id)) }); }
  catch (error) { rejected(res, error); }
}
export async function putKitchenIssueConversion(req: AuthRequest, res: Response): Promise<void> {
  try { res.json({ status: 'success', data: await saveKitchenIssueConversion(req.params.id, req.body, String(req.user!._id)) }); }
  catch (error) { rejected(res, error); }
}
export async function previewIssue(req: AuthRequest, res: Response): Promise<void> {
  try { res.json({ status: 'success', data: await previewKitchenIssue(req.params.id, req.body) }); }
  catch (error) { rejected(res, error); }
}
export async function postIssue(req: AuthRequest, res: Response): Promise<void> {
  try { const result = await postKitchenIssue(req.params.id, req.body, String(req.user!._id)); res.status(result.replayed ? 200 : 201).json({ status: 'success', ...result }); }
  catch (error) { rejected(res, error); }
}
