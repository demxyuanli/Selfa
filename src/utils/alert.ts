let alertFunction: ((message: string) => void) | null = null;

export const setAlertFunction = (fn: ((message: string) => void) | null) => {
  alertFunction = fn;
};

export const showAlert = (message: string) => {
  if (alertFunction) {
    alertFunction(message);
  } else {
    window.alert(message);
  }
};
