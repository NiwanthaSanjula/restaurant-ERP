import mongoose from 'mongoose';
import connectDB from './database';
jest.mock('mongoose', () => ({ __esModule: true, default: { connection: { readyState: 0 }, connect: jest.fn() } }));
beforeEach(() => { Object.assign(mongoose.connection, { readyState: 0 }); jest.mocked(mongoose.connect).mockReset(); });
afterEach(() => jest.restoreAllMocks());
it('shares one in-flight connection between cold requests and reuses a warm connection', async () => {
  const connect = jest.mocked(mongoose.connect).mockResolvedValue(mongoose);
  await Promise.all([connectDB(), connectDB()]); expect(connect).toHaveBeenCalledTimes(1);
  Object.assign(mongoose.connection, { readyState: 1 }); await connectDB(); expect(connect).toHaveBeenCalledTimes(1);
});
it('retries connection failures without exposing or logging connection values', async () => {
  const connect = jest.mocked(mongoose.connect).mockRejectedValueOnce(Error('fixture unavailable')).mockResolvedValueOnce(mongoose);
  await expect(connectDB()).rejects.toThrow('fixture unavailable'); await connectDB(); expect(connect).toHaveBeenCalledTimes(2);
});
