import React from "react";
import { useTranslation } from "react-i18next";
import { validatePrice } from "../utils/formValidation";

interface PriceInputProps {
  value: string;
  onChange: (value: string) => void;
  label?: string;
}

const PriceInput: React.FC<PriceInputProps> = ({ value, onChange, label }) => {
  const { t } = useTranslation();

  return (
    <div className="form-group">
      <label>{label || t("portfolio.price")}</label>
      <input
        type="text"
        value={value}
        onChange={(e) => {
          const val = e.target.value;
          if (validatePrice(val)) {
            onChange(val);
          }
        }}
        placeholder={t("portfolio.pricePlaceholder") || ""}
      />
    </div>
  );
};

export default PriceInput;
