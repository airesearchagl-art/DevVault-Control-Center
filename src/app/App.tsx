import { useEffect, useState } from "react";
import { tauriStorage, type StorageInfo } from "../services/storage";

/** Wave 1 shell: proves the native storage boundary is reachable. Replaced by the Review Hub UI in Wave 2. */
export default function App() {
  const [info, setInfo] = useState<StorageInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    tauriStorage.info().then(setInfo, (e: unknown) => setError(String(e)));
  }, []);

  return (
    <main>
      <h1>DevVault Control Center</h1>
      {error ? <p>{error}</p> : <p>{info ? `Data: ${info.dataDir}` : "Loading…"}</p>}
    </main>
  );
}
