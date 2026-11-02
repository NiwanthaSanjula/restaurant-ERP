import jwt from 'jsonwebtoken';
import User from '../../models/User';
import { authenticate } from '../../middleware/auth';
import { DEMO_ACTOR_ID } from './identity';

jest.mock('jsonwebtoken',()=>({__esModule:true,default:{verify:jest.fn()}}));
jest.mock('../../models/User',()=>({__esModule:true,default:{findById:jest.fn()}}));

test('actual authentication middleware denies the deactivated demo cashier before role authorization',async()=>{
  (jwt.verify as jest.Mock).mockReturnValue({id:DEMO_ACTOR_ID});
  const select=jest.fn().mockResolvedValue({_id:DEMO_ACTOR_ID,isActive:false,role:'staff'});
  (User.findById as jest.Mock).mockReturnValue({select});
  const res={status:jest.fn().mockReturnThis(),json:jest.fn()},next=jest.fn();
  await authenticate({header:()=> 'Bearer mocked-demo-session'} as any,res as any,next);
  expect(res.status).toHaveBeenCalledWith(401);expect(next).not.toHaveBeenCalled();
  expect(res.json).toHaveBeenCalledWith(expect.objectContaining({message:'Account is deactivated.'}));
});
