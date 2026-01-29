
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Vessel, Shift, TallyReport, TallyItem, Container, MechanicalDetail } from '../types';
import { MOCK_CONTAINERS, MOCK_WORKERS, MOCK_DRIVERS, MOCK_TRANSPORT_VEHICLES, MOCK_CUSTOMS_SEALS, HANDLING_METHODS, MOCK_EXTERNAL_UNITS } from '../constants';
import TallyPrintTemplate from '../components/TallyPrintTemplate';
import AutocompleteInput from '../components/AutocompleteInput';

interface TallyReportViewProps {
  vessel: Vessel;
  shift: Shift;
  mode: 'NHAP' | 'XUAT';
  workDate: string;
  user: string;
  initialReport?: TallyReport;
  onSave: (report: TallyReport, isDraft: boolean) => void;
  onFinish: () => void;
  onBack: () => void;
}

interface ExternalMechJob {
  id: string;
  count: number;
  task: string;
}

interface ExternalMechGroup {
  id: string;
  name: string;
  jobs: ExternalMechJob[];
}

const TallyReportView: React.FC<TallyReportViewProps> = ({ vessel, shift, mode, workDate, user, initialReport, onSave, onFinish, onBack }) => {
  const [subStep, setSubStep] = useState<1 | 2>(1);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [lastSavedTime, setLastSavedTime] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const [internalMechList, setInternalMechList] = useState<MechanicalDetail[]>([]);
  const [externalGroups, setExternalGroups] = useState<ExternalMechGroup[]>([]);

  const [currentReport, setCurrentReport] = useState<Partial<TallyReport>>({
    vesselId: vessel.id,
    mode: mode,
    shift: shift,
    workDate: workDate,
    owner: vessel.customerName,
    workerCount: 1, 
    workerNames: '',
    mechanicalCount: 0,
    mechanicalNames: '',
    externalMechanicalCount: 0,
    equipment: 'Hyster+Nâng+ĐK+Hyster',
    vehicleType: 'Xe nâng',
    vehicleNo: '',
    items: [],
    createdBy: user,
    mechanicalDetails: []
  });

  const [containerSearch, setContainerSearch] = useState('');
  const [showResults, setShowResults] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  
  const handlingOptions = useMemo(() => 
    mode === 'NHAP' ? HANDLING_METHODS.MECHANICAL_IMPORT : HANDLING_METHODS.MECHANICAL_EXPORT, 
  [mode]);

  const getAvailableOptions = useCallback((allOptions: string[], selectedValues: string[], currentValue: string) => {
    return allOptions.filter(opt => !selectedValues.includes(opt) || opt === currentValue);
  }, []);

  const storageKey = useMemo(() => {
    return `DANALOG_AUTOSAVE_${user}_${vessel.id}_${mode}_${shift}`;
  }, [user, vessel.id, mode, shift]);

  const restoreDataFromReport = useCallback((reportData: Partial<TallyReport>) => {
      setCurrentReport(prev => ({
        ...prev,
        ...reportData,
        vesselId: vessel.id,
        mode: mode,
        shift: shift,
        createdBy: user
      }));
      
      if (reportData.mechanicalDetails) {
        setInternalMechList(reportData.mechanicalDetails.filter((m: MechanicalDetail) => !m.isExternal));
        
        const externals = reportData.mechanicalDetails.filter((m: MechanicalDetail) => m.isExternal);
        const nameGroups: Record<string, MechanicalDetail[]> = {};
        externals.forEach((m: MechanicalDetail) => {
            const name = m.name || '';
            if (!nameGroups[name]) nameGroups[name] = [];
            nameGroups[name].push(m);
        });

        const loadedGroups: ExternalMechGroup[] = Object.entries(nameGroups).map(([name, items]) => {
            const taskCounts: Record<string, number> = {};
            items.forEach((m: MechanicalDetail) => {
                const t = m.task || handlingOptions[0];
                taskCounts[t] = (taskCounts[t] || 0) + 1;
            });

            const jobs: ExternalMechJob[] = Object.entries(taskCounts).map(([task, count]) => ({
                id: Math.random().toString(36).substr(2, 9),
                count,
                task
            }));

            return {
                id: Math.random().toString(36).substr(2, 9),
                name,
                jobs
            };
        });
        
        setExternalGroups(loadedGroups);
      }
  }, [vessel.id, mode, shift, user, handlingOptions]);

  useEffect(() => {
    if (initialReport) {
      restoreDataFromReport(initialReport);
    } else {
      const savedDraft = localStorage.getItem(storageKey);
      if (savedDraft) {
        try {
          const parsedDraft = JSON.parse(savedDraft);
          restoreDataFromReport(parsedDraft);
          setLastSavedTime("Đã khôi phục bản nháp cũ");
        } catch (e) {
          localStorage.removeItem(storageKey);
        }
      }
    }
  }, [initialReport, storageKey, restoreDataFromReport]);

  useEffect(() => {
    const hasData = (currentReport.items && currentReport.items.length > 0) || 
                    (currentReport.workerCount && currentReport.workerCount > 0) ||
                    internalMechList.length > 0;

    if (!hasData) return;

    const timer = setTimeout(() => {
        const dataToSave = {
            ...currentReport,
            lastUpdated: Date.now()
        };
        localStorage.setItem(storageKey, JSON.stringify(dataToSave));
        const now = new Date();
        setLastSavedTime(`Đã lưu tự động lúc ${now.getHours()}:${now.getMinutes().toString().padStart(2, '0')}`);
    }, 1000);

    return () => clearTimeout(timer);
  }, [currentReport, storageKey, internalMechList, externalGroups]);

  useEffect(() => {
    const expandedExternal: MechanicalDetail[] = [];
    externalGroups.forEach((g: ExternalMechGroup) => {
        g.jobs.forEach((j: ExternalMechJob) => {
             for(let i=0; i < j.count; i++) {
                expandedExternal.push({
                    name: g.name,
                    task: j.task,
                    isExternal: true
                });
            }
        });
    });

    const allMech = [...internalMechList, ...expandedExternal];
    setCurrentReport(prev => ({
        ...prev,
        mechanicalCount: internalMechList.length,
        externalMechanicalCount: expandedExternal.length,
        mechanicalNames: internalMechList.map((m: MechanicalDetail) => m.name).join(', '),
        mechanicalDetails: allMech
    }));
  }, [internalMechList, externalGroups]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setShowResults(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const availableContainers = useMemo(() => {
    if (mode === 'XUAT') {
        return MOCK_TRANSPORT_VEHICLES
          .filter(v => v.status === 'ACTIVE')
          .map((v, i) => ({
            id: `veh-${i}`,
            contNo: v.plate,
            size: 'XE TẢI',
            expectedUnits: 10, 
            expectedWeight: 18, 
            owner: '',
            sealNo: '',
            tkHouse: '',
            tkDnl: ''
        } as Container));
    }
    return MOCK_CONTAINERS[vessel.id] || [];
  }, [vessel.id, mode]);
  
  const filteredSearchContainers = availableContainers.filter((c: Container) => {
    const isExploitable = mode === 'XUAT' || (c.tkHouse && c.tkDnl);
    if (!isExploitable) return false;
    const isAlreadyAdded = mode !== 'XUAT' && currentReport.items?.some((i: TallyItem) => i.contId === c.id);
    if (isAlreadyAdded) return false;
    return c.contNo.toLowerCase().includes(containerSearch.toLowerCase());
  });

  const usedSealsSet = useMemo(() => {
    const set = new Set<string>();
    currentReport.items?.forEach((item: TallyItem) => {
        if (item.sealNo) {
            item.sealNo.split(', ').forEach((s: string) => {
                if (s && s.trim()) set.add(s.trim());
            });
        }
    });
    return set;
  }, [currentReport.items]);

  const addContainerToReport = (cont: Container) => {
    const isExploitable = currentReport.mode === 'XUAT' || (cont.tkHouse && cont.tkDnl);
    if (!isExploitable) {
      alert("Container này chưa đủ tờ khai!");
      return;
    }
    const randomTornUnits = Math.floor(Math.random() * 2) + 6;
    const itemId = currentReport.mode === 'XUAT' ? `${cont.id}_${Date.now()}` : cont.id;
    const newItem: TallyItem = {
      contId: itemId,
      contNo: cont.contNo,
      size: cont.size,
      commodityType: 'Giấy trắng có bọc',
      sealNo: cont.sealNo || '',
      actualUnits: cont.expectedUnits || 0,
      actualWeight: cont.expectedWeight || 0,
      isScratchedFloor: false,
      tornUnits: randomTornUnits,
      notes: '',
      transportVehicle: '',
      sealCount: currentReport.mode === 'XUAT' ? 2 : undefined,
      photos: [] 
    };
    setCurrentReport(prev => ({
      ...prev,
      items: [...(prev.items || []), newItem]
    }));
    setContainerSearch('');
    setShowResults(false);
  };

  const isItemComplete = (item: TallyItem) => {
    if (!item.actualUnits || item.actualUnits <= 0) return false;
    if (!item.actualWeight || item.actualWeight <= 0) return false;
    const minPhotos = mode === 'NHAP' ? 5 : 1;
    if (!item.photos || item.photos.length < minPhotos) return false;
    if (mode === 'XUAT') {
      if (!item.sealCount || item.sealCount <= 0) return false;
      const seals = item.sealNo ? item.sealNo.split(', ') : [];
      const filledSeals = seals.filter((s: string) => s && s.trim().length > 0);
      if (filledSeals.length < item.sealCount) return false;
    }
    return true;
  };

  const updateItem = (contId: string, field: keyof TallyItem, value: any) => {
    const newItems = currentReport.items!.map((item: TallyItem) => 
      item.contId === contId ? { ...item, [field]: value } : item
    );
    setCurrentReport(prev => ({ ...prev, items: newItems }));
  };

  const updateSealValue = (contId: string, sealIndex: number, value: string) => {
    const item = currentReport.items!.find((i: TallyItem) => i.contId === contId);
    if (!item) return;
    const seals = item.sealNo ? item.sealNo.split(', ') : [];
    while(seals.length < (item.sealCount || 0)) seals.push('');
    seals[sealIndex] = value;
    updateItem(contId, 'sealNo', seals.join(', '));
  };

  const handlePhotoUpload = (contId: string, e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const files = Array.from(e.target.files);
      const item = currentReport.items?.find((i: TallyItem) => i.contId === contId);
      if (!item) return;
      const newPhotos = [...(item.photos || [])];
      files.forEach((file: File) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          if (reader.result) {
            newPhotos.push(reader.result as string);
            updateItem(contId, 'photos', newPhotos);
          }
        };
        reader.readAsDataURL(file);
      });
    }
  };

  const removePhoto = (contId: string, photoIndex: number) => {
    const item = currentReport.items?.find((i: TallyItem) => i.contId === contId);
    if (!item || !item.photos) return;
    const newPhotos = item.photos.filter((_: string, idx: number) => idx !== photoIndex);
    updateItem(contId, 'photos', newPhotos);
  };

  const isStep1Valid = useMemo(() => {
    const wCount = currentReport.workerCount || 0;
    const mCount = internalMechList.length;
    const eCount = externalGroups.reduce((sum: number, g: ExternalMechGroup) => sum + g.jobs.reduce((js: number, j: ExternalMechJob) => js + j.count, 0), 0);
    if (wCount === 0 && mCount === 0 && eCount === 0) return false;
    if (wCount > 0) {
        const names = currentReport.workerNames ? currentReport.workerNames.split(',') : [];
        const filledNames = names.filter((n: string) => n && n.trim().length > 0);
        if (filledNames.length < wCount) return false;
    }
    if (internalMechList.some((m: MechanicalDetail) => !m.name || !m.name.trim() || !m.task)) return false;
    if (externalGroups.some((g: ExternalMechGroup) => !g.name || !g.name.trim() || g.jobs.length === 0 || g.jobs.some((j: ExternalMechJob) => j.count <= 0))) return false;
    if (!currentReport.equipment || currentReport.equipment.trim() === '') return false;
    if (!currentReport.vehicleType || currentReport.vehicleType.trim() === '') return false;
    if (!currentReport.vehicleNo || currentReport.vehicleNo.trim() === '') return false;
    return true;
  }, [currentReport.workerCount, currentReport.workerNames, internalMechList, externalGroups, currentReport.equipment, currentReport.vehicleType, currentReport.vehicleNo]);

  const validateInfo = (): boolean => {
    if (!isStep1Valid) {
      alert("Vui lòng điền đầy đủ thông tin chung!");
      return false;
    }
    const workerNames = currentReport.workerNames ? currentReport.workerNames.split(',').map((n: string) => n.trim()).filter(Boolean) : [];
    if (new Set(workerNames).size !== workerNames.length) {
        alert("Tên công nhân bị trùng lặp!");
        return false;
    }
    if (!currentReport.items || currentReport.items.length === 0) {
      alert("Vui lòng chọn ít nhất một Container!");
      return false;
    }
    const incompleteItems = currentReport.items.filter((item: TallyItem) => !isItemComplete(item));
    if (incompleteItems.length > 0) {
        alert("Một số container chưa đủ thông tin!");
        return false;
    }
    return true;
  };

  const handleNextStep = () => {
    if (isStep1Valid) setSubStep(2);
  };

  const handleFinalSave = (isDraft: boolean) => {
    if (isSubmitting) return;
    if (!isDraft && !validateInfo()) return;
    setIsSubmitting(true);
    const report = { 
      ...currentReport, 
      id: currentReport.id || `PKH-${Date.now()}`, 
      createdAt: currentReport.createdAt || Date.now(),
      status: isDraft ? 'NHAP' : 'HOAN_TAT'
    } as TallyReport;
    if (!isDraft) localStorage.removeItem(storageKey);
    setTimeout(() => {
        onSave(report, isDraft);
        setIsSubmitting(false);
    }, 100);
  };

  const handleBack = () => {
    if (subStep === 2) setSubStep(1);
    else onBack();
  };

  const updateWorkerName = (index: number, value: string) => {
    const names = currentReport.workerNames ? currentReport.workerNames.split(', ') : [];
    while (names.length < (currentReport.workerCount || 0)) names.push('');
    names[index] = value;
    setCurrentReport({ ...currentReport, workerNames: names.slice(0, currentReport.workerCount).join(', ') });
  };

  const addInternalMechanical = () => {
    let nextTask = handlingOptions[0];
    if (internalMechList.length > 0) {
        const lastTask = internalMechList[internalMechList.length - 1].task;
        const idx = handlingOptions.indexOf(lastTask);
        if (idx >= 0) nextTask = handlingOptions[(idx + 1) % handlingOptions.length];
    }
    const newItem: MechanicalDetail = { name: '', task: nextTask, isExternal: false };
    setInternalMechList([...internalMechList, newItem]);
  };

  const removeInternalMechanical = (index: number) => {
    setInternalMechList(internalMechList.filter((_, i) => i !== index));
  };

  const updateInternalMechanical = (index: number, field: keyof MechanicalDetail, value: string) => {
    const list = [...internalMechList];
    list[index] = { ...list[index], [field]: value };
    setInternalMechList(list);
  };

  const addExternalGroup = () => {
    setExternalGroups([...externalGroups, {
        id: Math.random().toString(36).substr(2, 9),
        name: '',
        jobs: [{ id: Math.random().toString(36).substr(2, 9), count: 1, task: handlingOptions[0] }]
    }]);
  };

  const removeExternalGroup = (index: number) => {
    const newGroups = [...externalGroups];
    newGroups.splice(index, 1);
    setExternalGroups(newGroups);
  };

  const updateExternalGroupName = (index: number, value: string) => {
    const newGroups = [...externalGroups];
    newGroups[index].name = value;
    setExternalGroups(newGroups);
  };

  const addExternalJob = (groupIndex: number) => {
    const newGroups = [...externalGroups];
    newGroups[groupIndex].jobs.push({
        id: Math.random().toString(36).substr(2, 9),
        count: 1,
        task: handlingOptions[0]
    });
    setExternalGroups(newGroups);
  };

  const removeExternalJob = (groupIndex: number, jobIndex: number) => {
    const newGroups = [...externalGroups];
    newGroups[groupIndex].jobs.splice(jobIndex, 1);
    setExternalGroups(newGroups);
  };

  const updateExternalJob = (groupIndex: number, jobIndex: number, field: keyof ExternalMechJob, value: any) => {
    const newGroups = [...externalGroups];
    newGroups[groupIndex].jobs[jobIndex] = { ...newGroups[groupIndex].jobs[jobIndex], [field]: value };
    setExternalGroups(newGroups);
  };

  const pendingItems = (currentReport.items || []).filter((i: TallyItem) => !isItemComplete(i));
  const completedItems = (currentReport.items || []).filter((i: TallyItem) => isItemComplete(i));
  
  const renderItemCard = (item: TallyItem, _idx: number, isComplete: boolean) => {
    const minPhotos = mode === 'NHAP' ? 5 : 1;
    const currentPhotoCount = item.photos?.length || 0;
    const isPhotoValid = currentPhotoCount >= minPhotos;

    return (
    <div key={item.contId} className={`p-4 bg-white rounded-2xl border shadow-sm space-y-4 transition-all ${isComplete ? 'border-green-200 bg-green-50/20' : 'border-blue-200 shadow-md ring-1 ring-blue-100'}`}>
      <div className="flex justify-between items-center">
        <span className={`text-[10px] font-black px-2 py-1 rounded-lg uppercase tracking-tight ${isComplete ? 'bg-green-600 text-white' : 'bg-blue-600 text-white'}`}>
          {isComplete ? '✓ Đã xong:' : '✎ Đang nhập:'} {item.contNo}
        </span>
        <button onClick={() => {
          const newItems = (currentReport.items || []).filter((i: TallyItem) => i.contId !== item.contId);
          setCurrentReport({...currentReport, items: newItems});
        }} className="text-red-500 font-black text-[10px] uppercase p-2 hover:bg-red-50 rounded-lg">Xóa</button>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-[9px] font-black text-gray-400 uppercase">Số kiện <span className="text-red-500">*</span></label>
          <input type="number" min="0" className="w-full p-3 bg-gray-50 border border-gray-100 rounded-xl font-black text-sm outline-none focus:bg-white focus:ring-2 focus:ring-blue-100" 
            value={item.actualUnits} onChange={e => updateItem(item.contId, 'actualUnits', Math.max(0, parseInt(e.target.value) || 0))} />
        </div>
        <div>
          <label className="text-[9px] font-black text-gray-400 uppercase">Trọng lượng (TẤN) <span className="text-red-500">*</span></label>
          <input type="number" min="0" step="0.1" className="w-full p-3 bg-gray-50 border border-gray-100 rounded-xl font-black text-sm outline-none focus:bg-white focus:ring-2 focus:ring-blue-100" 
            value={item.actualWeight} onChange={e => updateItem(item.contId, 'actualWeight', Math.max(0, parseFloat(e.target.value) || 0))} />
        </div>
      </div>
      {currentReport.mode === 'XUAT' && (
        <div className="space-y-2 bg-blue-50/50 p-3 rounded-xl border border-blue-50">
            <div>
                <label className="text-[9px] font-black text-blue-400 uppercase">Số lượng Seal <span className="text-red-500">*</span></label>
                <input type="number" min="0" className="w-full p-3 bg-white border border-blue-100 rounded-xl font-bold text-sm outline-none" value={item.sealCount || 0}
                    onChange={e => updateItem(item.contId, 'sealCount', Math.max(0, parseInt(e.target.value) || 0))} />
            </div>
            {item.sealCount && item.sealCount > 0 ? (
                <div className="grid grid-cols-1 gap-2 mt-2">
                    {Array.from({ length: item.sealCount }).map((_, sealIdx) => {
                        const seals = item.sealNo ? item.sealNo.split(', ') : [];
                        const currentVal = seals[sealIdx] || '';
                        return (
                            <div key={sealIdx}>
                                <AutocompleteInput 
                                    value={currentVal}
                                    onChange={(val: string) => updateSealValue(item.contId, sealIdx, val)}
                                    options={MOCK_CUSTOMS_SEALS.filter((opt: string) => !usedSealsSet.has(opt) || opt === currentVal)}
                                    placeholder={`Nhập Seal ${sealIdx + 1}...`}
                                    className="w-full p-3 bg-white border border-blue-100 rounded-xl font-bold text-xs outline-none uppercase"
                                />
                            </div>
                        );
                    })}
                </div>
            ) : null}
        </div>
      )}
      <div className={`p-3 rounded-xl border ${isPhotoValid ? 'bg-gray-50 border-gray-100' : 'bg-orange-50 border-orange-200'}`}>
        <div className="flex justify-between items-center mb-2">
            <label className={`text-[9px] font-black uppercase ${isPhotoValid ? 'text-gray-400' : 'text-orange-500'}`}>Hình ảnh <span className="text-red-500">*</span></label>
            <span className={`text-[9px] font-bold px-2 py-0.5 rounded-md ${isPhotoValid ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}`}>{currentPhotoCount} / {minPhotos}</span>
        </div>
        <div className="grid grid-cols-3 gap-2">
            <label className="aspect-square flex flex-col items-center justify-center border-2 border-dashed border-gray-300 rounded-xl bg-white cursor-pointer hover:bg-gray-50">
                <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => handlePhotoUpload(item.contId, e)} />
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /></svg>
            </label>
            {item.photos?.map((photo: string, pIdx: number) => (
                <div key={pIdx} className="relative aspect-square rounded-xl overflow-hidden shadow-sm group">
                    <img src={photo} alt={`P ${pIdx}`} className="w-full h-full object-cover" />
                    <button onClick={() => removePhoto(item.contId, pIdx)} className="absolute top-1 right-1 bg-black/50 text-white rounded-full p-1"><svg className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor"><path d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" /></svg></button>
                </div>
            ))}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
            <label className="text-[9px] font-black text-red-500 uppercase">Số kiện rách</label>
            <input type="number" min="0" className="w-full p-3 bg-gray-50 border border-red-50 rounded-xl font-black text-sm text-red-600" value={item.tornUnits} onChange={e => updateItem(item.contId, 'tornUnits', Math.max(0, parseInt(e.target.value) || 0))} />
        </div>
        <div>
            <label className="text-[9px] font-black text-gray-400 uppercase">Ghi chú</label>
            <input className="w-full p-3 bg-gray-50 border border-gray-100 rounded-xl font-bold text-[11px]" value={item.notes} onChange={e => updateItem(item.contId, 'notes', e.target.value)} />
        </div>
      </div>
    </div>
    );
  };

  return (
    <div className="space-y-6 pb-40 animate-fade-in relative">
      {subStep === 1 && (
            <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 space-y-6 animate-fade-in">
            <h3 className="text-lg font-black text-blue-900 uppercase">1. Thông tin chung</h3>
            <div className="space-y-4 border-b border-gray-100 pb-6">
                <h4 className="text-sm font-bold text-gray-600 flex items-center gap-2">Tổ Công Nhân</h4>
                <div className="grid grid-cols-3 gap-3">
                    <div>
                        <label className="text-[9px] font-black text-gray-400 uppercase">Số lượng</label>
                        <input type="number" min="0" className="w-full p-3 bg-gray-50 border border-gray-100 rounded-xl font-bold text-sm" value={currentReport.workerCount} onChange={e => setCurrentReport({...currentReport, workerCount: parseInt(e.target.value) || 0})} />
                    </div>
                    <div className="col-span-2">
                        <label className="text-[9px] font-black text-gray-400 uppercase">Danh sách nhân sự</label>
                        <div className="space-y-2 mt-1">
                            {Array.from({length: currentReport.workerCount || 0}).map((_, idx) => (
                                <AutocompleteInput key={idx} value={currentReport.workerNames?.split(', ')[idx] || ''} onChange={(val: string) => updateWorkerName(idx, val)} options={MOCK_WORKERS} placeholder={`Công nhân ${idx + 1}`} className="w-full p-2.5 bg-gray-50 border border-gray-100 rounded-xl font-bold text-xs" />
                            ))}
                        </div>
                    </div>
                </div>
            </div>
            <div className="space-y-4 border-b border-gray-100 pb-6">
                <div className="flex justify-between items-center">
                    <h4 className="text-sm font-bold text-gray-600">Cơ Giới Nội Bộ</h4>
                    <button onClick={addInternalMechanical} className="text-[10px] font-black bg-orange-50 text-orange-600 px-3 py-1.5 rounded-lg border border-orange-100 uppercase">+ Thêm xe</button>
                </div>
                <div className="space-y-3">
                    {internalMechList.map((mech: MechanicalDetail, index: number) => (
                        <div key={index} className="flex gap-2 items-start bg-orange-50/30 p-2 rounded-xl border border-orange-100">
                            <div className="flex-1 space-y-2">
                                <AutocompleteInput value={mech.name} onChange={(val: string) => updateInternalMechanical(index, 'name', val)} options={MOCK_DRIVERS} placeholder="Tên lái xe" className="w-full p-2 bg-white border border-orange-100 rounded-lg font-bold text-xs" />
                                <select className="w-full p-2 bg-white border border-orange-100 rounded-lg font-bold text-xs" value={mech.task} onChange={(e) => updateInternalMechanical(index, 'task', e.target.value)}>
                                    {handlingOptions.map((opt: string) => <option key={opt} value={opt}>{opt}</option>)}
                                </select>
                            </div>
                            <button onClick={() => removeInternalMechanical(index)} className="p-2 text-red-400">×</button>
                        </div>
                    ))}
                </div>
            </div>
            <div className="space-y-4 border-b border-gray-100 pb-6">
                <div className="flex justify-between items-center">
                    <h4 className="text-sm font-bold text-gray-600">Cơ Giới Ngoài</h4>
                    <button onClick={addExternalGroup} className="text-[10px] font-black bg-purple-50 text-purple-600 px-3 py-1.5 rounded-lg border border-purple-100 uppercase">+ Thêm đơn vị</button>
                </div>
                <div className="space-y-4">
                    {externalGroups.map((group: ExternalMechGroup, gIdx: number) => (
                        <div key={group.id} className="bg-purple-50/30 p-3 rounded-xl border border-purple-100 space-y-3">
                            <div className="flex gap-2">
                                <AutocompleteInput value={group.name} onChange={(val: string) => updateExternalGroupName(gIdx, val)} options={MOCK_EXTERNAL_UNITS} placeholder="Tên đơn vị" className="w-full p-2 bg-white border rounded-lg font-bold text-xs" />
                                <button onClick={() => removeExternalGroup(gIdx)} className="p-2 text-red-400 bg-white rounded-lg border">Xóa</button>
                            </div>
                            <div className="pl-2 space-y-2 border-l-2 border-purple-200">
                                {group.jobs.map((job: ExternalMechJob, jIdx: number) => (
                                    <div key={job.id} className="flex gap-2 items-center">
                                        <input type="number" min="1" className="w-16 p-2 bg-white border rounded-lg font-bold text-xs text-center" value={job.count} onChange={(e) => updateExternalJob(gIdx, jIdx, 'count', parseInt(e.target.value) || 1)} />
                                        <select className="flex-1 p-2 bg-white border rounded-lg font-bold text-xs" value={job.task} onChange={(e) => updateExternalJob(gIdx, jIdx, 'task', e.target.value)}>
                                            {handlingOptions.map((opt: string) => <option key={opt} value={opt}>{opt}</option>)}
                                        </select>
                                        <button onClick={() => removeExternalJob(gIdx, jIdx)} className="text-red-400 font-bold px-2">×</button>
                                    </div>
                                ))}
                                <button onClick={() => addExternalJob(gIdx)} className="text-[10px] font-bold text-purple-500 underline">+ Thêm việc</button>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                    <label className="text-[9px] font-black text-gray-400 uppercase">Thiết bị</label>
                    <input className="w-full p-3 bg-gray-50 border border-gray-100 rounded-xl font-bold text-sm" value={currentReport.equipment} onChange={e => setCurrentReport({...currentReport, equipment: e.target.value})} />
                </div>
                <div>
                    <label className="text-[9px] font-black text-gray-400 uppercase">Loại xe</label>
                    <input className="w-full p-3 bg-gray-50 border border-gray-100 rounded-xl font-bold text-sm" value={currentReport.vehicleType} onChange={e => setCurrentReport({...currentReport, vehicleType: e.target.value})} />
                </div>
                <div>
                    <label className="text-[9px] font-black text-gray-400 uppercase">Biển số</label>
                    <input className="w-full p-3 bg-gray-50 border border-gray-100 rounded-xl font-bold text-sm uppercase" value={currentReport.vehicleNo} onChange={e => setCurrentReport({...currentReport, vehicleNo: e.target.value})} />
                </div>
            </div>
            </div>
        )}
        {subStep === 2 && (
            <div className="space-y-6">
            <div className="bg-white p-4 rounded-3xl shadow-sm border border-gray-100 sticky top-0 z-30">
                <label className="text-[10px] font-black text-gray-400 uppercase ml-1 block mb-2">Thêm Container</label>
                <div className="relative" ref={searchRef}>
                    <input type="text" placeholder="Nhập số Container..." className="w-full p-4 pl-12 bg-gray-50 border-2 border-blue-100 rounded-2xl font-black text-gray-800 outline-none" value={containerSearch} onChange={(e) => { setContainerSearch(e.target.value); setShowResults(true); }} onFocus={() => setShowResults(true)} />
                    {showResults && filteredSearchContainers.length > 0 && (
                        <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-2xl shadow-2xl border max-h-60 overflow-y-auto z-40">
                            {filteredSearchContainers.map((c: Container) => (
                                <div key={c.id} onClick={() => addContainerToReport(c)} className="p-4 border-b border-gray-50 hover:bg-blue-50 cursor-pointer transition-colors group">
                                    <div className="flex justify-between items-center"><span className="font-black text-gray-800">{c.contNo}</span><span className="text-xs font-bold text-gray-500">{c.size}</span></div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
            <div className="space-y-4 px-1">
                {pendingItems.map((item: TallyItem, idx: number) => renderItemCard(item, idx, false))}
                {completedItems.length > 0 && pendingItems.length > 0 && (
                    <div className="flex items-center gap-4 py-4"><div className="h-px bg-green-200 flex-1"></div><span className="text-xs font-black text-green-600 uppercase">Hoàn tất ({completedItems.length})</span><div className="h-px bg-green-200 flex-1"></div></div>
                )}
                {completedItems.map((item: TallyItem, idx: number) => renderItemCard(item, idx, true))}
            </div>
            </div>
        )}
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-white/95 backdrop-blur-md border-t z-50 shadow-2xl">
            <div className="max-w-4xl mx-auto flex gap-3">
                <button onClick={handleBack} className="px-6 py-3 rounded-2xl bg-gray-100 text-gray-500 font-black uppercase text-[11px]">Quay lại</button>
                {subStep === 1 ? (
                    <button onClick={handleNextStep} disabled={!isStep1Valid} className={`flex-1 py-3 rounded-2xl font-black uppercase text-[11px] shadow-xl ${isStep1Valid ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-400 cursor-not-allowed'}`}>TIẾP THEO</button>
                ) : (
                    <>
                        <button onClick={() => handleFinalSave(true)} disabled={isSubmitting} className="flex-1 py-3 rounded-2xl bg-blue-100 text-blue-700 font-black uppercase text-[11px]">LƯU NHÁP</button>
                        <button onClick={() => handleFinalSave(false)} disabled={isSubmitting} className="flex-1 py-3 rounded-2xl bg-gradient-to-r from-green-500 to-emerald-600 text-white font-black uppercase text-[11px] shadow-xl">HOÀN TẤT</button>
                    </>
                )}
            </div>
        </div>
        {isPreviewing && (
            <div className="fixed inset-0 z-[100] bg-gray-900 overflow-y-auto">
            <div className="sticky top-0 p-4 bg-gray-800 text-white flex justify-between items-center shadow-lg">
                <button onClick={() => setIsPreviewing(false)} className="flex items-center gap-2 text-sm font-bold uppercase tracking-tight">QUAY LẠI</button>
                <div className="flex gap-2"><button onClick={() => window.print()} className="bg-blue-600 px-6 py-2 rounded-xl font-black text-xs uppercase shadow-lg">IN NGAY</button></div>
            </div>
            <div className="p-4 flex justify-center bg-gray-700 min-h-screen">
                <TallyPrintTemplate report={currentReport as TallyReport} vessel={vessel} isPreview={true} />
            </div>
            </div>
        )}
      <div className="hidden print:block"><TallyPrintTemplate report={currentReport as TallyReport} vessel={vessel} /></div>
    </div>
  );
};

export default TallyReportView;
