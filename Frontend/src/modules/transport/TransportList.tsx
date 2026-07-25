import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { TripQueueList } from "../../components/stage/TripQueueList";
import { CreateTripModal } from "./CreateTripModal";

/** The "Transport" module itself: trips still open for vehicle arrangement / order
 * attachment (Status="OPEN"). The other 6 Transport-family modules reuse TripQueueList
 * directly (see App.tsx) since they don't need the create-trip action. */
export function TransportList() {
  const navigate = useNavigate();
  const [showCreate, setShowCreate] = useState(false);

  return (
    <div>
      <TripQueueList moduleKey="transport" label="Transport" prevStatus="OPEN" onCreateNew={() => setShowCreate(true)} />
      {showCreate && (
        <CreateTripModal
          onClose={() => setShowCreate(false)}
          onCreated={(transportId) => {
            setShowCreate(false);
            navigate(`/modules/transport/${transportId}`);
          }}
        />
      )}
    </div>
  );
}
