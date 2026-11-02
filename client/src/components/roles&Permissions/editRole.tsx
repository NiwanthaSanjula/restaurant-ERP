import { useParams } from 'react-router-dom';
import RoleEditor from './RoleEditor';
export default function EditRole() {
  const { id } = useParams();
  return <RoleEditor roleId={id} />;
}
