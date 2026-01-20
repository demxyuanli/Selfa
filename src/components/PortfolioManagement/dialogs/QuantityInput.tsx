import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { validateQuantity } from "../utils/formValidation";

interface QuantityInputProps {
  value: string;
  onChange: (value: string) => void;
}

const QuantityInput: React.FC<QuantityInputProps> = ({ value, onChange }) => {
  const { t } = useTranslation();
  const [error, setError] = useState("");

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    if (validateQuantity(val)) {
      setError("");
      onChange(val);
    } else {
      setError(t("portfolio.invalidQuantity") || "Invalid quantity");
    }
  };

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    e.stopPropagation();
    const val = e.target.value;
    if (val && !validateQuantity(val)) {
      setError(t("portfolio.invalidQuantity") || "Invalid quantity");
    } else {
      setError("");
    }
  };

  return (
    <div className="form-group">
      <label>{t("portfolio.quantity")}</label>
      <input
        type="text"
        value={value}
        onChange={handleChange}
        onBlur={handleBlur}
        onClick={(e) => e.stopPropagation()}
        onFocus={(e) => e.stopPropagation()}
        placeholder={t("portfolio.quantityPlaceholder") || ""}
        className={error ? "form-input error" : "form-input"}
      />
      {error && <div className="form-error">{error}</div>}
    </div>
  );
};

export default QuantityInput;
