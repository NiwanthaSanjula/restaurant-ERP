import mongoose, { Document, Schema } from 'mongoose';

export interface IActivityLog extends Document {
  userId?: string;
  username?: string;
  role?: string;
  action: string;
  entityType: string;
  entityId: string;
  before?: any;
  after?: any;
  metadata?: any;
  createdAt?: Date;
}

const activityLogSchema = new Schema<IActivityLog>(
  {
    userId: { type: String },
    username: { type: String },
    role: { type: String },
    action: { type: String, required: true },
    entityType: { type: String, required: true },
    entityId: { type: String, required: true },
    before: { type: Schema.Types.Mixed },
    after: { type: Schema.Types.Mixed },
    metadata: { type: Schema.Types.Mixed }
  },
  {
    timestamps: { createdAt: 'createdAt', updatedAt: false },
    minimize: false
  }
);

activityLogSchema.index({ entityType: 1 });
activityLogSchema.index({ entityId: 1 });
activityLogSchema.index({ action: 1 });
activityLogSchema.index({ createdAt: -1 });

const ActivityLog = mongoose.model<IActivityLog>('ActivityLog', activityLogSchema);
export default ActivityLog;
