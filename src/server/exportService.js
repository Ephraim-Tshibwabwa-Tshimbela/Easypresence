import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { getAllForExport, getStats } from './db.js';

function resolveSession(filter, explicitSession) {
  if (explicitSession && explicitSession !== 'auto') return explicitSession;
  if (filter === 'present_info' || filter === 'absent_info') return 'info';
  if (filter === 'present_test' || filter === 'absent_test') return 'test';
  if (filter === 'present_both') return 'both';
  return 'all';
}

function getFilterLabel(filter, session) {
  if (session === 'info') {
    if (filter === 'present_info') return 'Présents à la Journée d\'Information';
    if (filter === 'absent_info') return 'Absents à la Journée d\'Information';
    return 'Tous les candidats (Statut Journée Info)';
  }
  if (session === 'test') {
    if (filter === 'present_test') return 'Présents à la Journée du Test';
    if (filter === 'absent_test') return 'Absents à la Journée du Test';
    return 'Tous les candidats (Statut Journée Test)';
  }
  switch (filter) {
    case 'present_info': return 'Présents à la Journée d\'Information';
    case 'absent_info': return 'Absents à la Journée d\'Information';
    case 'present_test': return 'Présents à la Journée du Test';
    case 'absent_test': return 'Absents à la Journée du Test';
    case 'present_both': return 'Présents aux DEUX journées (Info & Test)';
    default: return 'Toutes les personnes inscrites';
  }
}

/**
 * Builds an Excel (.xlsx) file buffer
 */
export function generateExcelExport(filter = 'all', sessionParam = null) {
  const session = resolveSession(filter, sessionParam);
  const persons = getAllForExport(filter);
  const stats = getStats();

  const wb = XLSX.utils.book_new();

  if (session === 'info') {
    // Single Day: Journée Information
    const summaryData = [
      ['APPLICATION DE GESTION DE PRÉSENCE - LISTE DES PRÉSENCES : JOURNÉE D\'INFORMATION'],
      ['Date d\'exportation :', new Date().toLocaleString('fr-FR')],
      ['Filtre appliqué :', getFilterLabel(filter, session)],
      [
        'Total inscrits :', stats.total,
        'Présents Info :', `${stats.presentInfo} (${stats.rateInfo} %)`,
        'Absents Info :', stats.absentInfo
      ],
      []
    ];

    const tableData = persons.map((p, idx) => {
      let dateInfo = '', timeInfo = '';
      if (p.present_at_info) {
        const parts = p.present_at_info.split(' ');
        dateInfo = parts[0] || '';
        timeInfo = parts[1] || '';
      }

      const rowObj = {
        'N°': p.sn || (idx + 1),
        'Matricule': p.matricule || '',
        'Nom': p.nom || '',
        'Post-nom': p.postnom || '',
        'Prénom': p.prenom || '',
        'Sexe': p.sexe || '',
        'Statut Info': p.is_present_info === 1 ? 'PRÉSENT' : 'ABSENT',
        'Date Pointage': dateInfo,
        'Heure Pointage': timeInfo,
        'Agent / Poste': p.present_by_info || '',
        'Émargement / Signature': ''
      };

      if (p.extra_data) {
        try {
          const extra = typeof p.extra_data === 'string' ? JSON.parse(p.extra_data) : p.extra_data;
          if (extra && typeof extra === 'object') {
            for (const [k, v] of Object.entries(extra)) {
              rowObj[k] = v;
            }
          }
        } catch (_) {}
      }

      return rowObj;
    });

    const ws = XLSX.utils.json_to_sheet(tableData, { origin: 'A6' });
    XLSX.utils.sheet_add_aoa(ws, summaryData, { origin: 'A1' });

    ws['!cols'] = [
      { wch: 6 },  // N°
      { wch: 18 }, // Matricule
      { wch: 20 }, // Nom
      { wch: 18 }, // Post-nom
      { wch: 18 }, // Prénom
      { wch: 8 },  // Sexe
      { wch: 14 }, // Statut Info
      { wch: 14 }, // Date
      { wch: 12 }, // Heure
      { wch: 18 }, // Agent
      { wch: 22 }  // Signature
    ];

    XLSX.utils.book_append_sheet(wb, ws, 'Présences Journée Info');
    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

  } else if (session === 'test') {
    // Single Day: Journée du Test
    const summaryData = [
      ['APPLICATION DE GESTION DE PRÉSENCE - LISTE DES PRÉSENCES : JOURNÉE DU TEST'],
      ['Date d\'exportation :', new Date().toLocaleString('fr-FR')],
      ['Filtre appliqué :', getFilterLabel(filter, session)],
      [
        'Total inscrits :', stats.total,
        'Présents Test :', `${stats.presentTest} (${stats.rateTest} %)`,
        'Absents Test :', stats.absentTest
      ],
      []
    ];

    const tableData = persons.map((p, idx) => {
      let dateTest = '', timeTest = '';
      if (p.present_at_test) {
        const parts = p.present_at_test.split(' ');
        dateTest = parts[0] || '';
        timeTest = parts[1] || '';
      }

      const rowObj = {
        'N°': p.sn || (idx + 1),
        'Matricule': p.matricule || '',
        'Nom': p.nom || '',
        'Post-nom': p.postnom || '',
        'Prénom': p.prenom || '',
        'Sexe': p.sexe || '',
        'Statut Test': p.is_present_test === 1 ? 'PRÉSENT' : 'ABSENT',
        'Date Pointage': dateTest,
        'Heure Pointage': timeTest,
        'Agent / Poste': p.present_by_test || '',
        'Émargement / Signature': ''
      };

      if (p.extra_data) {
        try {
          const extra = typeof p.extra_data === 'string' ? JSON.parse(p.extra_data) : p.extra_data;
          if (extra && typeof extra === 'object') {
            for (const [k, v] of Object.entries(extra)) {
              rowObj[k] = v;
            }
          }
        } catch (_) {}
      }

      return rowObj;
    });

    const ws = XLSX.utils.json_to_sheet(tableData, { origin: 'A6' });
    XLSX.utils.sheet_add_aoa(ws, summaryData, { origin: 'A1' });

    ws['!cols'] = [
      { wch: 6 },  // N°
      { wch: 18 }, // Matricule
      { wch: 20 }, // Nom
      { wch: 18 }, // Post-nom
      { wch: 18 }, // Prénom
      { wch: 8 },  // Sexe
      { wch: 14 }, // Statut Test
      { wch: 14 }, // Date
      { wch: 12 }, // Heure
      { wch: 18 }, // Agent
      { wch: 22 }  // Signature
    ];

    XLSX.utils.book_append_sheet(wb, ws, 'Présences Journée Test');
    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

  } else {
    // Dual Session (Both / All)
    const summaryData = [
      ['APPLICATION DE GESTION DE PRÉSENCE - RAPPORT DOUBLE SÉANCE (INFO & TEST)'],
      ['Date d\'exportation :', new Date().toLocaleString('fr-FR')],
      ['Filtre appliqué :', getFilterLabel(filter, session)],
      [
        'Total inscrits :', stats.total,
        'Présents Info :', `${stats.presentInfo} (${stats.rateInfo} %)`,
        'Présents Test :', `${stats.presentTest} (${stats.rateTest} %)`,
        'Présents aux 2 séances :', stats.presentBoth
      ],
      []
    ];

    const tableData = persons.map((p, idx) => {
      let dateInfo = '', timeInfo = '';
      if (p.present_at_info) {
        const parts = p.present_at_info.split(' ');
        dateInfo = parts[0] || '';
        timeInfo = parts[1] || '';
      }

      let dateTest = '', timeTest = '';
      if (p.present_at_test) {
        const parts = p.present_at_test.split(' ');
        dateTest = parts[0] || '';
        timeTest = parts[1] || '';
      }

      const rowObj = {
        'N°': p.sn || (idx + 1),
        'Matricule': p.matricule || '',
        'Nom': p.nom || '',
        'Post-nom': p.postnom || '',
        'Prénom': p.prenom || '',
        'Sexe': p.sexe || '',
        'J. Info Statut': p.is_present_info === 1 ? 'PRÉSENT' : 'ABSENT',
        'J. Info Date': dateInfo,
        'J. Info Heure': timeInfo,
        'J. Info Agent': p.present_by_info || '',
        'J. Test Statut': p.is_present_test === 1 ? 'PRÉSENT' : 'ABSENT',
        'J. Test Date': dateTest,
        'J. Test Heure': timeTest,
        'J. Test Agent': p.present_by_test || ''
      };

      if (p.extra_data) {
        try {
          const extra = typeof p.extra_data === 'string' ? JSON.parse(p.extra_data) : p.extra_data;
          if (extra && typeof extra === 'object') {
            for (const [k, v] of Object.entries(extra)) {
              rowObj[k] = v;
            }
          }
        } catch (_) {}
      }

      return rowObj;
    });

    const ws = XLSX.utils.json_to_sheet(tableData, { origin: 'A6' });
    XLSX.utils.sheet_add_aoa(ws, summaryData, { origin: 'A1' });

    ws['!cols'] = [
      { wch: 6 },  // N°
      { wch: 18 }, // Matricule
      { wch: 18 }, // Nom
      { wch: 18 }, // Post-nom
      { wch: 18 }, // Prénom
      { wch: 8 },  // Sexe
      { wch: 14 }, // Info Statut
      { wch: 12 }, // Info Date
      { wch: 10 }, // Info Heure
      { wch: 16 }, // Info Agent
      { wch: 14 }, // Test Statut
      { wch: 12 }, // Test Date
      { wch: 10 }, // Test Heure
      { wch: 16 }  // Test Agent
    ];

    XLSX.utils.book_append_sheet(wb, ws, 'Présences Info & Test');
    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  }
}

/**
 * Builds a PDF file buffer with single-day or dual-day tracking
 */
export function generatePdfExport(filter = 'all', customTitle = null, sessionParam = null) {
  const session = resolveSession(filter, sessionParam);
  const persons = getAllForExport(filter);
  const stats = getStats();

  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4'
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  const dateStr = new Date().toLocaleDateString('fr-FR', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  if (session === 'info') {
    // --- PDF Journée Info ---
    const title = customTitle || 'LISTE DES PRÉSENCES — JOURNÉE D\'INFORMATION';

    // Header Banner (Blue Primary)
    doc.setFillColor(30, 58, 138); // Deep Blue
    doc.rect(0, 0, pageWidth, 26, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(15);
    doc.setFont('helvetica', 'bold');
    doc.text(title.toUpperCase(), pageWidth / 2, 11, { align: 'center' });

    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(191, 219, 254);
    doc.text(`Rapport officiel généré le ${dateStr} — Mode Hors-Ligne`, pageWidth / 2, 19, { align: 'center' });

    // KPI Cards
    const cardY = 30;
    const cardWidth = (pageWidth - 30) / 4;
    const cardHeight = 14;

    const kpis = [
      { label: 'TOTAL INSCRITS', val: String(stats.total), color: [71, 85, 105] },
      { label: 'PRÉSENTS INFO', val: `${stats.presentInfo} (${stats.rateInfo}%)`, color: [37, 99, 235] },
      { label: 'ABSENTS INFO', val: String(stats.absentInfo), color: [220, 38, 38] },
      { label: 'SÉANCE', val: 'Information', color: [15, 23, 42] }
    ];

    kpis.forEach((kpi, idx) => {
      const x = 15 + idx * (cardWidth + 2);
      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(226, 232, 240);
      doc.roundedRect(x, cardY, cardWidth, cardHeight, 2, 2, 'FD');

      doc.setFontSize(7);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(100, 116, 139);
      doc.text(kpi.label, x + cardWidth / 2, cardY + 4.5, { align: 'center' });

      doc.setFontSize(10.5);
      doc.setTextColor(kpi.color[0], kpi.color[1], kpi.color[2]);
      doc.text(kpi.val, x + cardWidth / 2, cardY + 11, { align: 'center' });
    });

    const tableRows = persons.map((p, index) => {
      const fullName = [p.nom, p.postnom, p.prenom].filter(Boolean).join(' ');
      const isPres = p.is_present_info === 1;
      const statusText = isPres ? 'PRÉSENT' : 'ABSENT';
      const timeStr = p.present_at_info ? p.present_at_info : '-';
      const agentStr = p.present_by_info || '-';

      return [
        p.sn || String(index + 1),
        p.matricule || '-',
        fullName,
        p.sexe || '-',
        statusText,
        timeStr,
        agentStr,
        '' // Signature blank
      ];
    });

    autoTable(doc, {
      startY: 48,
      head: [['N°', 'Matricule', 'Nom complet & Prénoms', 'Sexe', 'Statut Info', 'Heure / Date Pointage', 'Agent / Poste', 'Émargement / Signature']],
      body: tableRows,
      theme: 'grid',
      headStyles: {
        fillColor: [30, 58, 138],
        textColor: [255, 255, 255],
        fontSize: 8.5,
        fontStyle: 'bold',
        halign: 'center',
        cellPadding: 2.5
      },
      bodyStyles: {
        fontSize: 8,
        textColor: [30, 41, 59],
        cellPadding: 2,
        valign: 'middle'
      },
      columnStyles: {
        0: { halign: 'center', cellWidth: 12 },
        1: { halign: 'center', cellWidth: 32 },
        2: { cellWidth: 78, fontStyle: 'bold' },
        3: { halign: 'center', cellWidth: 14 },
        4: { halign: 'center', cellWidth: 28 },
        5: { halign: 'center', cellWidth: 40 },
        6: { cellWidth: 32 },
        7: { cellWidth: 31 }
      },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      didParseCell: function (data) {
        if (data.section === 'body' && data.column.index === 4) {
          if (data.cell.raw === 'PRÉSENT') {
            data.cell.styles.textColor = [37, 99, 235];
            data.cell.styles.fontStyle = 'bold';
          } else {
            data.cell.styles.textColor = [220, 38, 38];
          }
        }
      },
      margin: { left: 15, right: 15, bottom: 18 },
      didDrawPage: function (data) {
        const str = `Page ${doc.internal.getNumberOfPages()}`;
        doc.setFontSize(8);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(148, 163, 184);
        doc.text(str, pageWidth / 2, pageHeight - 8, { align: 'center' });
        doc.text('EasyPresence — Liste des Présences Journée d\'Information', 15, pageHeight - 8);
      }
    });

  } else if (session === 'test') {
    // --- PDF Journée Test ---
    const title = customTitle || 'LISTE DES PRÉSENCES — JOURNÉE DU TEST';

    // Header Banner (Emerald Green)
    doc.setFillColor(6, 95, 70); // Deep Emerald
    doc.rect(0, 0, pageWidth, 26, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(15);
    doc.setFont('helvetica', 'bold');
    doc.text(title.toUpperCase(), pageWidth / 2, 11, { align: 'center' });

    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(167, 243, 208);
    doc.text(`Rapport officiel généré le ${dateStr} — Mode Hors-Ligne`, pageWidth / 2, 19, { align: 'center' });

    // KPI Cards
    const cardY = 30;
    const cardWidth = (pageWidth - 30) / 4;
    const cardHeight = 14;

    const kpis = [
      { label: 'TOTAL INSCRITS', val: String(stats.total), color: [71, 85, 105] },
      { label: 'PRÉSENTS TEST', val: `${stats.presentTest} (${stats.rateTest}%)`, color: [16, 185, 129] },
      { label: 'ABSENTS TEST', val: String(stats.absentTest), color: [220, 38, 38] },
      { label: 'SÉANCE', val: 'Test', color: [15, 23, 42] }
    ];

    kpis.forEach((kpi, idx) => {
      const x = 15 + idx * (cardWidth + 2);
      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(226, 232, 240);
      doc.roundedRect(x, cardY, cardWidth, cardHeight, 2, 2, 'FD');

      doc.setFontSize(7);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(100, 116, 139);
      doc.text(kpi.label, x + cardWidth / 2, cardY + 4.5, { align: 'center' });

      doc.setFontSize(10.5);
      doc.setTextColor(kpi.color[0], kpi.color[1], kpi.color[2]);
      doc.text(kpi.val, x + cardWidth / 2, cardY + 11, { align: 'center' });
    });

    const tableRows = persons.map((p, index) => {
      const fullName = [p.nom, p.postnom, p.prenom].filter(Boolean).join(' ');
      const isPres = p.is_present_test === 1;
      const statusText = isPres ? 'PRÉSENT' : 'ABSENT';
      const timeStr = p.present_at_test ? p.present_at_test : '-';
      const agentStr = p.present_by_test || '-';

      return [
        p.sn || String(index + 1),
        p.matricule || '-',
        fullName,
        p.sexe || '-',
        statusText,
        timeStr,
        agentStr,
        ''
      ];
    });

    autoTable(doc, {
      startY: 48,
      head: [['N°', 'Matricule', 'Nom complet & Prénoms', 'Sexe', 'Statut Test', 'Heure / Date Pointage', 'Agent / Poste', 'Émargement / Signature']],
      body: tableRows,
      theme: 'grid',
      headStyles: {
        fillColor: [6, 95, 70],
        textColor: [255, 255, 255],
        fontSize: 8.5,
        fontStyle: 'bold',
        halign: 'center',
        cellPadding: 2.5
      },
      bodyStyles: {
        fontSize: 8,
        textColor: [30, 41, 59],
        cellPadding: 2,
        valign: 'middle'
      },
      columnStyles: {
        0: { halign: 'center', cellWidth: 12 },
        1: { halign: 'center', cellWidth: 32 },
        2: { cellWidth: 78, fontStyle: 'bold' },
        3: { halign: 'center', cellWidth: 14 },
        4: { halign: 'center', cellWidth: 28 },
        5: { halign: 'center', cellWidth: 40 },
        6: { cellWidth: 32 },
        7: { cellWidth: 31 }
      },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      didParseCell: function (data) {
        if (data.section === 'body' && data.column.index === 4) {
          if (data.cell.raw === 'PRÉSENT') {
            data.cell.styles.textColor = [16, 185, 129];
            data.cell.styles.fontStyle = 'bold';
          } else {
            data.cell.styles.textColor = [220, 38, 38];
          }
        }
      },
      margin: { left: 15, right: 15, bottom: 18 },
      didDrawPage: function (data) {
        const str = `Page ${doc.internal.getNumberOfPages()}`;
        doc.setFontSize(8);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(148, 163, 184);
        doc.text(str, pageWidth / 2, pageHeight - 8, { align: 'center' });
        doc.text('EasyPresence — Liste des Présences Journée du Test', 15, pageHeight - 8);
      }
    });

  } else {
    // --- PDF Dual Session (Info & Test) ---
    const title = customTitle || 'LISTE DE PRÉSENCE — JOURNÉES D\'INFORMATION & TEST';

    // Header Banner
    doc.setFillColor(15, 23, 42); // Slate 900
    doc.rect(0, 0, pageWidth, 26, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(15);
    doc.setFont('helvetica', 'bold');
    doc.text(title.toUpperCase(), pageWidth / 2, 11, { align: 'center' });

    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(203, 213, 225);
    doc.text(`Rapport officiel généré le ${dateStr} — Mode Hors-Ligne`, pageWidth / 2, 19, { align: 'center' });

    // Summary KPI Cards (Horizontal 4-card layout)
    const cardY = 30;
    const cardWidth = (pageWidth - 30) / 4;
    const cardHeight = 14;

    const kpis = [
      { label: 'TOTAL INSCRITS', val: String(stats.total), color: [71, 85, 105] },
      { label: 'PRÉSENTS INFO', val: `${stats.presentInfo} (${stats.rateInfo}%)`, color: [59, 130, 246] },
      { label: 'PRÉSENTS TEST', val: `${stats.presentTest} (${stats.rateTest}%)`, color: [16, 185, 129] },
      { label: 'PRÉSENTS AUX 2 SÉANCES', val: String(stats.presentBoth), color: [168, 85, 247] }
    ];

    kpis.forEach((kpi, idx) => {
      const x = 15 + idx * (cardWidth + 2);
      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(226, 232, 240);
      doc.roundedRect(x, cardY, cardWidth, cardHeight, 2, 2, 'FD');

      doc.setFontSize(7);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(100, 116, 139);
      doc.text(kpi.label, x + cardWidth / 2, cardY + 4.5, { align: 'center' });

      doc.setFontSize(10.5);
      doc.setTextColor(kpi.color[0], kpi.color[1], kpi.color[2]);
      doc.text(kpi.val, x + cardWidth / 2, cardY + 11, { align: 'center' });
    });

    const tableRows = persons.map((p, index) => {
      const fullName = [p.nom, p.postnom, p.prenom].filter(Boolean).join(' ');
      
      const infoStatus = p.is_present_info === 1 
        ? `PRÉSENT\n${p.present_at_info ? p.present_at_info.substring(5, 16) : ''}`
        : 'ABSENT';

      const testStatus = p.is_present_test === 1 
        ? `PRÉSENT\n${p.present_at_test ? p.present_at_test.substring(5, 16) : ''}`
        : 'ABSENT';

      const agents = [];
      if (p.present_by_info) agents.push(`Info: ${p.present_by_info}`);
      if (p.present_by_test) agents.push(`Test: ${p.present_by_test}`);

      return [
        p.sn || String(index + 1),
        p.matricule || '-',
        fullName,
        p.sexe || '-',
        infoStatus,
        testStatus,
        agents.join('\n') || '-'
      ];
    });

    autoTable(doc, {
      startY: 48,
      head: [['N°', 'Matricule', 'Nom complet & Prénoms', 'Sexe', 'Journée Information', 'Journée Test', 'Postes & Émargement']],
      body: tableRows,
      theme: 'grid',
      headStyles: {
        fillColor: [30, 41, 59],
        textColor: [255, 255, 255],
        fontSize: 8,
        fontStyle: 'bold',
        halign: 'center',
        cellPadding: 2
      },
      bodyStyles: {
        fontSize: 8,
        textColor: [30, 41, 59],
        cellPadding: 2,
        valign: 'middle'
      },
      columnStyles: {
        0: { halign: 'center', cellWidth: 12 },
        1: { halign: 'center', cellWidth: 34 },
        2: { cellWidth: 80, fontStyle: 'bold' },
        3: { halign: 'center', cellWidth: 14 },
        4: { halign: 'center', cellWidth: 38 },
        5: { halign: 'center', cellWidth: 38 },
        6: { cellWidth: 50 }
      },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      didParseCell: function (data) {
        if (data.section === 'body') {
          if (data.column.index === 4) {
            if (data.cell.raw && data.cell.raw.startsWith('PRÉSENT')) {
              data.cell.styles.textColor = [59, 130, 246];
              data.cell.styles.fontStyle = 'bold';
            } else {
              data.cell.styles.textColor = [239, 68, 68];
            }
          }
          if (data.column.index === 5) {
            if (data.cell.raw && data.cell.raw.startsWith('PRÉSENT')) {
              data.cell.styles.textColor = [16, 185, 129];
              data.cell.styles.fontStyle = 'bold';
            } else {
              data.cell.styles.textColor = [239, 68, 68];
            }
          }
        }
      },
      margin: { left: 15, right: 15, bottom: 18 },
      didDrawPage: function (data) {
        const str = `Page ${doc.internal.getNumberOfPages()}`;
        doc.setFontSize(8);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(148, 163, 184);
        doc.text(str, pageWidth / 2, pageHeight - 8, { align: 'center' });
        doc.text('EasyPresence — Gestion des Présences (Journée Information & Test)', 15, pageHeight - 8);
      }
    });
  }

  const arrayBuffer = doc.output('arraybuffer');
  return Buffer.from(arrayBuffer);
}

// ---------------------------------------------------------------------------
// 🚀 ASYNCHRONOUS WORKER THREAD POOL FOR NON-BLOCKING EXPORTS
// ---------------------------------------------------------------------------

let activeExportWorkers = 0;
const MAX_CONCURRENT_EXPORTS = 2;

/**
 * Runs heavy PDF or Excel generation on a separate Worker Thread.
 * Keeps the main Node.js event loop 100% available and responsive to agents.
 */
export function runExportAsync({ type, filter = 'all', title = null, session = null, timeoutMs = 45000 }) {
  if (activeExportWorkers >= MAX_CONCURRENT_EXPORTS) {
    return Promise.reject(new Error('Le serveur traite actuellement le nombre maximal d\'exportations simultanées (2). Veuillez patienter quelques instants.'));
  }

  activeExportWorkers++;

  return new Promise(async (resolve, reject) => {
    let finished = false;
    let worker = null;

    try {
      const { Worker } = await import('node:worker_threads');
      const { fileURLToPath } = await import('node:url');
      const path = (await import('node:path')).default;

      const workerPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), './exportWorker.js');

      worker = new Worker(workerPath, {
        workerData: { type, filter, title, session }
      });

      const timeout = setTimeout(() => {
        if (!finished) {
          finished = true;
          activeExportWorkers = Math.max(0, activeExportWorkers - 1);
          try { worker.terminate(); } catch (_) {}
          reject(new Error('Délai d\'attente dépassé lors de la génération de l\'export (timeout de 45s).'));
        }
      }, timeoutMs);

      worker.on('message', (msg) => {
        if (finished) return;
        finished = true;
        clearTimeout(timeout);
        activeExportWorkers = Math.max(0, activeExportWorkers - 1);
        try { worker.terminate(); } catch (_) {}

        if (msg.success) {
          resolve(Buffer.from(msg.buffer));
        } else {
          reject(new Error(msg.error || 'Erreur lors de la génération de l\'export.'));
        }
      });

      worker.on('error', (err) => {
        if (finished) return;
        finished = true;
        clearTimeout(timeout);
        activeExportWorkers = Math.max(0, activeExportWorkers - 1);
        reject(err);
      });

      worker.on('exit', (code) => {
        if (!finished && code !== 0) {
          finished = true;
          clearTimeout(timeout);
          activeExportWorkers = Math.max(0, activeExportWorkers - 1);
          reject(new Error(`Le worker d'export s'est interrompu avec le code de sortie ${code}.`));
        }
      });
    } catch (importErr) {
      activeExportWorkers = Math.max(0, activeExportWorkers - 1);
      // Fallback to synchronous generation if worker threads cannot be spawned
      try {
        if (type === 'pdf') {
          resolve(generatePdfExport(filter, title, session));
        } else {
          resolve(generateExcelExport(filter, session));
        }
      } catch (syncErr) {
        reject(syncErr);
      }
    }
  });
}
