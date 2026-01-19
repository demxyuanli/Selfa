import React from "react";
import { useTranslation } from "react-i18next";
import { validateQuantity } from "../utils/formValidation";

interface QuantityInputProps {
  value: string;
  onChange: (value: string) => void;
}

const QuantityInput: React.FC<QuantityInputProps> = ({ value, onChange }) => {
  const { t } = useTranslation();

  return (
    <div className="form-group">
      <label>{t("portfolio.quantity")}</label>
      <input
        type="text"
        value={value}
        onChange={(e) => {
          const val = e.target.value;
          if (validateQuantity(val)) {
            onChange(val);
          }
        }}
        placeholder={t("portfolio.quantityPlaceholder") || ""}
      />
    </div>
  );
};

export default QuantityInput;
