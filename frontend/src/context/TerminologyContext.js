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

const L = '\\p{L}';
const RULES = [
  [/N°\s?(?:de\s+)?compte/giu, 'N° partenaire'],
  [new RegExp(`(?<!${L})d[ée]p[ôo]ts(?!${L})`, 'giu'), "Droits d'accès"],
  [new RegExp(`(?<!${L})d[ée]p[ôo]t(?!${L})`, 'giu'), "Droit d'accès"],
  [new RegExp(`(?<!${L})(?:retraits?|retirer)(?!${L})`, 'giu'), 'Accès physique'],
  [new RegExp(`(?<!${L})transferts?(?!${L})`, 'giu'), 'Switch access'],
];

export function partnerize(text) {
  if (!text) return text;
  let out = text;
  for (const [re, rep] of RULES) {
    out = out.replace(re, (m) => (m[0] === m[0].toLowerCase() && m[0] !== m[0].toUpperCase()
      ? rep[0].toLowerCase() + rep.slice(1) : rep));
  }
  return out;
}

function convertNode(root) {
  if (!root) return;
  if (root.nodeType === 3) {
    const p = root.parentElement;
    if (p && !p.closest('[data-no-term],script,style,textarea')) {
      const v = partnerize(root.nodeValue);
      if (v !== root.nodeValue) root.nodeValue = v;
    }
    return;
  }
  if (root.nodeType !== 1 || root.closest('[data-no-term]')) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  nodes.forEach(convertNode);
  root.querySelectorAll?.('[placeholder]').forEach((el) => {
    const v = partnerize(el.getAttribute('placeholder'));
    if (v !== el.getAttribute('placeholder')) el.setAttribute('placeholder', v);
  });
}

const TerminologyContext = createContext({ mode: 'standard', label: (k) => LABELS.standard[k] || k, refresh: () => {} });

export function TerminologyProvider({ children }) {
  const [mode, setMode] = useState('standard');

  const refresh = useCallback(() => {
    API.get('/settings/terminology')
      .then(res => setMode(res.data.mode === 'partner' ? 'partner' : 'standard'))
      .catch(() => {});
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    if (mode !== 'partner') return undefined;
    convertNode(document.body);
    const obs = new MutationObserver((muts) => {
      obs.disconnect();
      muts.forEach((m) => {
        if (m.type === 'characterData') convertNode(m.target);
        else m.addedNodes.forEach(convertNode);
      });
      obs.observe(document.body, { childList: true, subtree: true, characterData: true });
    });
    obs.observe(document.body, { childList: true, subtree: true, characterData: true });
    return () => obs.disconnect();
  }, [mode]);

  const label = (key) => LABELS[mode]?.[key] || LABELS.standard[key] || key;

  return (
    <TerminologyContext.Provider value={{ mode, label, refresh }}>
      {children}
    </TerminologyContext.Provider>
  );
}

export const useTerminology = () => useContext(TerminologyContext);
