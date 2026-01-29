
import React, { useState } from 'react';
import { Vessel, Shift, TallyReport, WorkOrder, MechanicalDetail, TallyItem } from './types';
import { HANDLING_METHODS, MOCK_CONTAINERS } from './constants';
import LoginView from './views/LoginView';
import VesselSelectionView from './views/VesselSelectionView';
import TallyReportView from './views/TallyReportView';
import HistoryView from './views/HistoryView';
import TallyModeSelectionView from './views/TallyModeSelectionView';
import CompletionView from './views/CompletionView';
import Header from './components/Header';
import SuccessPopup from './components/SuccessPopup';

type AppStep = 
  | 'DANG_NHAP' 
  | 'CHON_LOAI_TALLY'
  | 'CHON_TAU' 
  | 'NHAP_TALLY' 
  | 'DANH_SACH_TALLY' 
  | 'DANH_SACH_WO'
  | 'HOAN_TAT';

const App: React.FC = () => {
  const [step, setStep] = useState<AppStep>('DANG_NHAP');
  const [user, setUser] = useState<string | null>(null);
  const [tallyMode, setTallyMode] = useState<'NHAP' | 'XUAT' | null>(null);
  const [selectedVessel, setSelectedVessel] = useState<Vessel | null>(null);
  const [selectedShift, setSelectedShift] = useState<Shift | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>('');
  
  const [allReports, setAllReports] = useState<TallyReport[]>([]);
  const [allWorkOrders, setAllWorkOrders] = useState<WorkOrder[]>([]);
  
  const [editingReport, setEditingReport] = useState<TallyReport | null>(null);
  const [lastCreatedWOs, setLastCreatedWOs] = useState<WorkOrder[]>([]);
  const [lastCreatedReports, setLastCreatedReports] = useState<TallyReport[]>([]);

  const [showSuccess, setShowSuccess] = useState(false);

  const handleLogin = (username: string) => {
    setUser(username);
    setStep('CHON_LOAI_TALLY');
  };

  const handleSelectMode = (mode: 'NHAP' | 'XUAT') => {
    setTallyMode(mode);
    setStep('CHON_TAU');
  };

  const handleSelectVessel = (vessel: Vessel, shift: Shift, date: string, isHoliday: boolean, isWeekend: boolean) => {
    setSelectedVessel(vessel);
    setSelectedShift(shift);
    setSelectedDate(date);
    setStep('NHAP_TALLY');
  };

  const handleSaveReport = (report: TallyReport, isDraft: boolean) => {
    let finalReports: TallyReport[] = [];
    const ITEMS_PER_PAGE = 15;

    // Helper to generate unique IDs
    const generateId = (prefix: string, index: number = 0) => `${prefix}-${Date.now()}-${index}`;

    if (editingReport) {
      setAllReports(allReports.map(r => r.id === report.id ? report : r));
      finalReports = [report];
      setEditingReport(null);
    } else {
      // LOGIC TÁCH TALLY: Container thường vs Xe thớt (chỉ áp dụng hàng Nhập)
      let groupedItems: { container: TallyItem[], flatbed: TallyItem[] } = { container: [], flatbed: [] };
      
      if (report.mode === 'NHAP') {
        report.items.forEach(item => {
           const isFlatbed = item.contNo.includes('/') || (MOCK_CONTAINERS[report.vesselId]?.find(c => c.contNo === item.contNo)?.size === 'XE THỚT');
           
           if (isFlatbed) groupedItems.flatbed.push(item);
           else groupedItems.container.push(item);
        });
      } else {
        groupedItems.container = report.items;
      }

      // Tạo các report con từ các nhóm
      const createSubReports = (items: TallyItem[], category: 'CONTAINER' | 'XE_THOT') => {
        if (items.length === 0) return;
        const totalPages = Math.max(1, Math.ceil(items.length / ITEMS_PER_PAGE));
        
        // Find max sequence specifically for this vessel and mode pattern
        // ID pattern: MODE-VesselID-Seq (e.g., NHAP-v4-01)
        const idPrefix = `${report.mode}-${report.vesselId}-`;
        const existingReports = allReports.filter(r => r.id && r.id.startsWith(idPrefix));
        
        let maxSeq = 0;
        existingReports.forEach(r => {
            const parts = r.id.split('-');
            const lastPart = parts[parts.length - 1];
            const num = parseInt(lastPart);
            if (!isNaN(num) && num > maxSeq) maxSeq = num;
        });

        // Also check against currently generated reports in this batch to avoid duplicates within same save action
        finalReports.forEach(r => {
             if (r.id && r.id.startsWith(idPrefix)) {
                const parts = r.id.split('-');
                const lastPart = parts[parts.length - 1];
                const num = parseInt(lastPart);
                if (!isNaN(num) && num > maxSeq) maxSeq = num;
             }
        });

        let currentSeq = maxSeq;

        for (let i = 0; i < totalPages; i++) {
            currentSeq++;
            const seqStr = currentSeq.toString().padStart(2, '0');
            const chunkItems = items.slice(i * ITEMS_PER_PAGE, (i + 1) * ITEMS_PER_PAGE);
            
            const subReport: TallyReport = {
                ...report,
                id: `${idPrefix}${seqStr}`,
                items: chunkItems,
                vehicleCategory: category
            };
            finalReports.push(subReport);
        }
      };

      createSubReports(groupedItems.container, 'CONTAINER');
      createSubReports(groupedItems.flatbed, 'XE_THOT');

      setAllReports([...finalReports, ...allReports]);
    }
    
    if (isDraft) {
      setShowSuccess(true);
      setStep('DANH_SACH_TALLY');
    } else {
      setLastCreatedReports(finalReports);
      const newWOs: WorkOrder[] = [];

      finalReports.forEach((r) => {
          const totalUnits = r.items.reduce((sum, item) => sum + item.actualUnits, 0);
          const totalWeight = r.items.reduce((sum, item) => sum + item.actualWeight, 0);

          let unitLabel = 'Cont';
          if (r.mode === 'XUAT' || r.vehicleCategory === 'XE_THOT') {
             unitLabel = 'Xe';
          }

          let workerHandlingMethod = "";
          if (r.mode === 'XUAT') {
             workerHandlingMethod = HANDLING_METHODS.WORKER_EXPORT;
          } else {
             if (r.vehicleCategory === 'XE_THOT') {
                workerHandlingMethod = HANDLING_METHODS.WORKER_IMPORT_FLATBED;
             } else {
                workerHandlingMethod = HANDLING_METHODS.WORKER_IMPORT_CONT;
             }
          }

          const woCN: WorkOrder = {
            id: generateId('WO-CN', newWOs.length),
            reportId: r.id,
            type: 'CONG_NHAN',
            organization: r.workerNames || 'Tổ Công Nhân',
            personCount: r.workerCount,
            vehicleType: '',
            vehicleNo: '',
            handlingMethod: workerHandlingMethod,
            commodityType: 'Giấy vuông',
            specification: `${r.items.length} ${unitLabel}`,
            quantity: totalUnits,
            weight: totalWeight,
            dayLaborerCount: 0,
            note: '',
            status: 'HOAN_TAT'
          };
          newWOs.push(woCN);

          if (r.mechanicalDetails && r.mechanicalDetails.length > 0) {
              const mechGroups: Record<string, MechanicalDetail[]> = {};
              
              r.mechanicalDetails.forEach(mech => {
                  const key = `${mech.isExternal ? 'EXT' : 'INT'}|${mech.task}`;
                  if (!mechGroups[key]) mechGroups[key] = [];
                  mechGroups[key].push(mech);
              });

              Object.entries(mechGroups).forEach(([key, mechs]) => {
                  const [typeCode, task] = key.split('|');
                  const isExternal = typeCode === 'EXT';
                  const uniqueNames = Array.from(new Set(mechs.map(m => m.name))).filter(Boolean).join(', ');
                  
                  const woMech: WorkOrder = {
                      id: generateId(isExternal ? 'WO-CG-EXT' : 'WO-CG', newWOs.length),
                      reportId: r.id,
                      type: isExternal ? 'CO_GIOI_NGOAI' : 'CO_GIOI',
                      // Fix: Use the unique external unit name instead of generic "Cơ Giới Ngoài" if available
                      organization: isExternal ? uniqueNames : (uniqueNames || r.mechanicalNames || 'Tổ Cơ Giới'),
                      personCount: mechs.length,
                      vehicleType: r.vehicleType,
                      vehicleNo: isExternal ? '' : r.vehicleNo,
                      handlingMethod: task,
                      commodityType: 'Giấy vuông',
                      specification: `${r.items.length} ${unitLabel}`,
                      quantity: totalUnits,
                      weight: totalWeight,
                      dayLaborerCount: 0,
                      note: isExternal ? `Thuê ngoài: ${uniqueNames}` : `Lái xe: ${uniqueNames}`,
                      status: 'HOAN_TAT'
                  };
                  newWOs.push(woMech);
              });
          } else {
             if (r.mechanicalCount > 0) {
                 const woCG: WorkOrder = {
                    id: generateId('WO-CG-LEGACY', newWOs.length),
                    reportId: r.id,
                    type: 'CO_GIOI',
                    organization: r.mechanicalNames || 'Tổ Cơ Giới DNL',
                    personCount: r.mechanicalCount,
                    vehicleType: r.vehicleType,
                    vehicleNo: r.vehicleNo,
                    handlingMethod: r.mode === 'NHAP' ? 'Cont -> Cửa kho' : 'Cửa kho -> Lên xe',
                    commodityType: 'Giấy vuông',
                    specification: `${r.items.length} ${unitLabel}`,
                    quantity: totalUnits,
                    weight: totalWeight,
                    dayLaborerCount: 0,
                    note: '',
                    status: 'HOAN_TAT'
                  };
                  newWOs.push(woCG);
             }
          }
      });

      setAllWorkOrders([...newWOs, ...allWorkOrders]);
      setLastCreatedWOs(newWOs);
      setStep('HOAN_TAT');
    }
  };

  const handleNavigate = (target: AppStep | 'LOGOUT' | 'CREATE_IMPORT_TALLY' | 'CREATE_EXPORT_TALLY') => {
    if (target === 'LOGOUT') {
      setUser(null);
      setStep('DANG_NHAP');
    } else if (target === 'CREATE_IMPORT_TALLY') {
      setTallyMode('NHAP');
      setStep('CHON_TAU');
    } else if (target === 'CREATE_EXPORT_TALLY') {
      setTallyMode('XUAT');
      setStep('CHON_TAU');
    } else {
      setStep(target as AppStep);
    }
  };

  const renderContent = () => {
    switch (step) {
      case 'DANG_NHAP':
        return <LoginView onLogin={handleLogin} />;
      case 'CHON_LOAI_TALLY':
        return <TallyModeSelectionView onSelect={handleSelectMode} />;
      case 'CHON_TAU':
        return <VesselSelectionView onSelect={handleSelectVessel} />;
      case 'NHAP_TALLY':
        return (
          <TallyReportView 
            vessel={selectedVessel!} 
            shift={selectedShift!} 
            mode={tallyMode!}
            workDate={selectedDate}
            user={user || ''}
            initialReport={editingReport || undefined}
            onSave={handleSaveReport}
            onFinish={() => setStep('CHON_LOAI_TALLY')}
            onBack={() => setStep('CHON_LOAI_TALLY')}
          />
        );
      case 'DANH_SACH_TALLY':
        return <HistoryView reports={allReports} workOrders={allWorkOrders} mode="TALLY" onEditTally={(r) => { setEditingReport(r); setStep('NHAP_TALLY'); }} />;
      case 'DANH_SACH_WO':
        return <HistoryView reports={allReports} workOrders={allWorkOrders} mode="WO" />;
      case 'HOAN_TAT':
        return (
          <CompletionView 
            workOrders={lastCreatedWOs} 
            reports={lastCreatedReports} 
            onDone={() => setStep('CHON_LOAI_TALLY')} 
          />
        );
      default:
        return <TallyModeSelectionView onSelect={handleSelectMode} />;
    }
  };

  const getHeaderTitle = () => {
    if (step === 'CHON_LOAI_TALLY') return 'CHỌN NGHIỆP VỤ';
    if (step === 'NHAP_TALLY') return `TALLY HÀNG ${tallyMode === 'NHAP' ? 'NHẬP' : 'XUẤT'}`;
    if (step === 'HOAN_TAT') return 'HOÀN TẤT';
    return 'DANALOG';
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col relative overflow-x-hidden">
      {step !== 'DANG_NHAP' && step !== 'HOAN_TAT' && (
        <div className="w-full flex justify-center bg-blue-600 sticky top-0 z-[60] shadow-md">
            <div className="w-full max-w-screen-lg">
                <Header 
                  title={getHeaderTitle()} 
                  user={user} 
                  onNavigate={handleNavigate} 
                />
            </div>
        </div>
      )}
      
      <SuccessPopup 
        show={showSuccess} 
        onClose={() => setShowSuccess(false)} 
        vesselName={selectedVessel?.name}
      />

      <main className={`flex-1 w-full mx-auto max-w-screen-lg ${step !== 'DANG_NHAP' && step !== 'HOAN_TAT' ? 'p-4 md:p-6 lg:p-8' : ''}`}>
        {renderContent()}
      </main>
    </div>
  );
};

export default App;
