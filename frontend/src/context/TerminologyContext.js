import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import API from '../utils/api';

const LABELS = {
  standard: {
    account_number: 'N° de compte',
    account_number_short: 'N° compte',
    transfer: 'Transfert',
    transfers: 'Transferts',
    withdrawal: 'Retrait',
    withdrawals: 'Retraits',
    deposit: 'Dépôt',
    deposits: 'Dépôts',
  },
  partner: {
    account_number: 'N° partenaire',
    account_number_short: 'N° partenaire',
    transfer: 'Switch access',
    transfers: 'Switch access',
    withdrawal: 'Accès physique',
    withdrawals: 'Accès physique',
    deposit: "Droit d'accès",
    deposits: "Droits d'accès",
  },
};

const TerminologyContext = createContext({ mode: 'standard', label: (k) => LABELS.standard[k] || k, refresh: () => {} });

export function TerminologyProvider({ children }) {
  const [mode, setMode] = useState('standard');

  const refresh = useCallback(() => {
    API.get('/settings/terminology')
      .then(res => setMode(res.data.mode === 'partner' ? 'partner' : 'standard'))
      .catch(() => {});
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const label = (key) => LABELS[mode]?.[key] || LABELS.standard[key] || key;

  return (
    <TerminologyContext.Provider value={{ mode, label, refresh }}>
      {children}
    </TerminologyContext.Provider>
  );
}

export const useTerminology = () => useContext(TerminologyContext);
