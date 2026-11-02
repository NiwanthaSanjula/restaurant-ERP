import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import React, { useState } from "react";
import { formatDate } from '../../utils/date.ts';

interface ExportPDFButtonProps {
  columns: string[];
  data: any[]; 
  fileName?: string;
  reportTitle?: string;
  subtitle?: string;
  disabled?: boolean;
  fetchData?: () => Promise<any[]>;
}

const ExportPDFButton: React.FC<ExportPDFButtonProps> = ({
  columns,
  data,
  fileName = "report",
  reportTitle = "Report",
  subtitle,
  disabled = false,
  fetchData,
}) => {
  const [loading, setLoading] = useState(false);

  const handleExport = async () => {
    try {
      setLoading(true);

      const exportData = fetchData ? await fetchData() : data;
      if (!exportData || exportData.length === 0) {
        alert("No data to export!");
        return;
      }

      const doc = new jsPDF("p", "pt", "a4");

      doc.setFontSize(18);
      doc.text(reportTitle, doc.internal.pageSize.getWidth() / 2, 30, { align: "center" });
      doc.setFontSize(12);
      doc.text(`Date: ${formatDate()}`, doc.internal.pageSize.getWidth() - 40, 30, { align: "right" });

      if (subtitle) {
        doc.setFontSize(11);
        doc.text(subtitle, 20, 46);
      }

      const rows = exportData.map((row) => columns.map((col) => row[col] ?? "-"));

      autoTable(doc, {
        head: [columns],
        body: rows,
        startY: subtitle ? 58 : 50,
        styles: { fontSize: 10 },
        headStyles: { fillColor: [0, 31, 84], textColor: 255 },
        margin: { left: 20, right: 20 },
      });

      doc.save(`${fileName}.pdf`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleExport}
      disabled={disabled || loading}
      style={{
        background: disabled || loading ? "#a0aec0" : "#001F54",
        color: "#fff",
        padding: "8px 16px",
        borderRadius: "6px",
        border: "none",
        cursor: disabled || loading ? "not-allowed" : "pointer",
        fontWeight: 600,
        fontSize: "1rem",
      }}
    >
      {loading ? "Exporting..." : "Export as PDF"}
    </button>
  );
};

export default ExportPDFButton;
