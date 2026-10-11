import { createContext, useContext } from 'react';

export interface ShellActions {
  openAddBookmark: () => void;
  openNewCollection: () => void;
}

export const ShellContext = createContext<ShellActions>({ openAddBookmark: () => {}, openNewCollection: () => {} });

export const useShell = () => useContext(ShellContext);
