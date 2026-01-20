import React, { createContext, useContext, useState, useCallback, ReactNode, useEffect } from "react";
import AlertDialog from "../components/AlertDialog";
import { setAlertFunction } from "../utils/alert";

interface AlertContextType {
  showAlert: (message: string) => void;
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

  const showAlert = useCallback((msg: string) => {
    setMessage(msg);
    setIsOpen(true);
  }, []);

  useEffect(() => {
    setAlertFunction(showAlert);
    return () => {
      setAlertFunction(null);
    };
  }, [showAlert]);

  const handleClose = useCallback(() => {
    setIsOpen(false);
  }, []);

  return (
    <AlertContext.Provider value={{ showAlert }}>
      {children}
      <AlertDialog isOpen={isOpen} message={message} onClose={handleClose} />
    </AlertContext.Provider>
  );
};
