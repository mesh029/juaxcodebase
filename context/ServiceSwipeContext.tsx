import { createContext, useContext, useRef, type MutableRefObject, type ReactNode } from 'react';

type ServiceSwipeContextValue = {
  blockRef: MutableRefObject<boolean>;
};

const ServiceSwipeContext = createContext<ServiceSwipeContextValue | null>(null);

export function ServiceSwipeProvider({ children }: { children: ReactNode }) {
  const blockRef = useRef(false);
  return (
    <ServiceSwipeContext.Provider value={{ blockRef }}>{children}</ServiceSwipeContext.Provider>
  );
}

export function useServiceSwipeBlockRef(): MutableRefObject<boolean> | undefined {
  return useContext(ServiceSwipeContext)?.blockRef;
}
