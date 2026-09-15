import { Navigate, useParams } from 'react-router-dom';

import { useBuyer } from '../BuyerContext.jsx';
import Afford from './Afford.jsx';
import Compare from './Compare.jsx';
import Dpa from './Dpa.jsx';
import Loans from './Loans.jsx';
import MoveIn from './MoveIn.jsx';
import Payment from './Payment.jsx';
import Savings from './Savings.jsx';

const SCREENS = {
  payment: Payment,
  afford: Afford,
  loans: Loans,
  compare: Compare,
  dpa: Dpa,
  savings: Savings,
  movein: MoveIn,
};

/** Routes /c/:communityId/tool/:toolKey, respecting the admin's per-tool toggles. */
export default function ToolScreen() {
  const { communityId, toolKey } = useParams();
  const { community } = useBuyer();
  const Screen = SCREENS[toolKey];
  if (!Screen || !community?.tools?.[toolKey]) return <Navigate to={`/c/${communityId}/tools`} replace />;
  return <Screen />;
}
