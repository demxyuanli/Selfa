import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  ReactNode,
  useEffect,
} from "react";
import AlertDialog from "../components/AlertDialog";
import ConfirmDialog from "../components/ConfirmDialog";
import { setAlertFunction } from "../utils/alert";

interface AlertContextType {
  showAlert: (message: string) => void;
  showConfirm: (message: string) => Promise<boolean>;
}

const AlertContext = createContext<AlertContextType | undefined>(undefined);

export const useAlert = () => {
  const context = useContext(AlertContext);
  if (!context) {
    throw new Error("useAlert must be used within AlertProvider");
  }
  return context;
};

interface AlertProviderProps {
  children: ReactNode;
}

export const AlertProvider: React.FC<AlertProviderProps> = ({ children }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmMessage, setConfirmMessage] = useState("");
  const confirmResolverRef = useRef<((value: boolean) => void) | null>(null);
  const confirmResolvedRef = useRef(false);

  const showAlert = useCallback((msg: string) => {
    setMessage(msg);
    setIsOpen(true);
  }, []);

  const showConfirm = useCallback((msg: string): Promise<boolean> => {
    return new Promise<boolean>((resolve) => {
      confirmResolverRef.current = resolve;
      confirmResolvedRef.current = false;
      setConfirmMessage(msg);
      setConfirmOpen(true);
    });
  }, []);

  useEffect(() => {
    setAlertFunction(showAlert);
    return () => {
      setAlertFunction(null);
    };
  }, [showAlert]);

  const handleAlertClose = useCallback(() => {
    setIsOpen(false);
  }, []);

  const handleConfirmConfirm = useCallback(() => {
    if (confirmResolvedRef.current) return;
    confirmResolvedRef.current = true;
    const resolve = confirmResolverRef.current;
    confirmResolverRef.current = null;
    setConfirmOpen(false);
    if (resolve) resolve(true);
  }, []);

  const handleConfirmCancel = useCallback(() => {
    if (confirmResolvedRef.current) return;
    confirmResolvedRef.current = true;
    const resolve = confirmResolverRef.current;
    confirmResolverRef.current = null;
    setConfirmOpen(false);
    if (resolve) resolve(false);
  }, []);

  return (
    <AlertContext.Provider value={{ showAlert, showConfirm }}>
      {children}
      <AlertDialog isOpen={isOpen} message={message} onClose={handleAlertClose} />
      <ConfirmDialog
        isOpen={confirmOpen}
        message={confirmMessage}
        onConfirm={handleConfirmConfirm}
        onCancel={handleConfirmCancel}
      />
    </AlertContext.Provider>
  );
};
