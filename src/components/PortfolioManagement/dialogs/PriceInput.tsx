import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { validatePrice } from "../utils/formValidation";

interface PriceInputProps {
  value: string;
  onChange: (value: string) => void;
  label?: string;
}

const PriceInput: React.FC<PriceInputProps> = ({ value, onChange, label }) => {
  const { t } = useTranslation();
  const [error, setError] = useState("");

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    if (validatePrice(val)) {
      setError("");
      onChange(val);
    } else {
      setError(t("portfolio.invalidPrice") || "Invalid price");
    }
  };

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    e.stopPropagation();
    const val = e.target.value;
    if (val && !validatePrice(val)) {
      setError(t("portfolio.invalidPrice") || "Invalid price");
    } else {
      setError("");
    }
  };

  return (
    <div className="form-group">
      <label>{label || t("portfolio.price")}</label>
      <input
        type="text"
        value={value}
        onChange={handleChange}
        onBlur={handleBlur}
        onClick={(e) => e.stopPropagation()}
        onFocus={(e) => e.stopPropagation()}
        placeholder={t("portfolio.pricePlaceholder") || ""}
        className={error ? "form-input error" : "form-input"}
      />
      {error && <div className="form-error">{error}</div>}
    </div>
  );
};

export default PriceInput;
