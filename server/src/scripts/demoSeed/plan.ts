import crypto from 'crypto';
import mongoose from 'mongoose';
import { addDaysToDateOnlyParts, formatDateOnlyParts, parseDateOnlyParts, zonedDateTimeToUtc } from '../../utils/timezone';

export const NAMESPACE = 'servesmart-demo-rest014-v1';
export const RANDOM_SEED = 140026;
export type Row = Record<string, any>;
export interface Entry { model: string; key: string; doc: Row }
export interface Anchor { asOf: string; cutoff: string; actorId: string; currency: string }
export interface Plan { version: 1; namespace: string; anchor: Anchor; entries: Entry[]; dates: string[]; weekdayDates: number; summary: Row }
export const oid = (key: string) => new mongoose.Types.ObjectId(crypto.createHash('sha256').update(`${NAMESPACE}/${key}`).digest('hex').slice(0, 24));
export const money = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
export const quantity = (value: number) => Math.round(value * 1e6) / 1e6;
export function canonical(value: any): any {
  if (value instanceof Date) return value.toISOString();
  if (value instanceof mongoose.Types.ObjectId) return value.toHexString();
  if (value instanceof Map) return canonical(Object.fromEntries(value));
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().filter(key => value[key] !== undefined).map(key => [key, canonical(value[key])]));
  return value;
}
export const fingerprint = (value: unknown) => crypto.createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');

/** Credential material belongs only in User, never in seed metadata or planning hashes. */
export function fixtureDoc(model: string, doc: Row): Row {
  if (model !== 'User') return doc;
  const { passwordHash, password, ...safe } = doc;
  return safe;
}
export const fixtureFingerprint = (model: string, doc: Row) => fingerprint(fixtureDoc(model, doc));

/** Includes 60 preceding Mon–Fri business dates, today, and intervening weekends. No holiday calendar is configured. */
export function demoDates(asOf: string): string[] {
  let first = parseDateOnlyParts(asOf, 'Asia/Colombo');
  let preceding = 0;
  while (preceding < 60) {
    first = addDaysToDateOnlyParts(first, -1);
    const weekday = new Date(Date.UTC(first.year, first.month - 1, first.day)).getUTCDay();
    if (weekday !== 0 && weekday !== 6) preceding++;
  }
  const dates: string[] = [];
  for (let d = first; formatDateOnlyParts(d) <= asOf; d = addDaysToDateOnlyParts(d, 1)) dates.push(formatDateOnlyParts(d));
  return dates;
}

const raw = [
  ['Rice', 'kg', 250, 1.2], ['Chicken', 'kg', 1800, 5], ['Fish', 'kg', 2200, 6],
  ['Vegetables', 'kg', 450, 1.6], ['Flour', 'kg', 250, 1.1], ['Eggs', 'pcs', 45, .18],
  ['Coconut milk', 'l', 950, 2.8], ['Lentils', 'kg', 450, 1.5], ['Cooking oil', 'l', 850, 2.5],
  ['Sugar', 'kg', 300, 1.2], ['Tea leaves', 'kg', 1800, 6], ['Coffee beans', 'kg', 4500, 14],
  ['Seasonal fruit', 'kg', 600, 2], ['Fresh milk', 'l', 550, 1.6]
] as const;
type RecipeSpec = Array<[number, number]>;
interface MenuSpec { name: string; category: number; lkr: number; eur: number; recipe?: RecipeSpec; large?: [number, number]; stockCost?: [number, number] }
const rice: RecipeSpec = [[0,.15],[3,.09],[7,.03],[6,.04],[8,.015]];
const kottu: RecipeSpec = [[4,.18],[3,.08],[5,1],[8,.02]];
const fried: RecipeSpec = [[0,.15],[3,.08],[5,1],[8,.02]];
const menu: MenuSpec[] = [
  {name:'Chicken Rice & Curry',category:0,lkr:1000,eur:4,recipe:[...rice,[1,.12]]},
  {name:'Fish Rice & Curry',category:0,lkr:1100,eur:4,recipe:[...rice,[2,.12]]},
  {name:'Vegetable Rice & Curry',category:0,lkr:700,eur:3,recipe:rice},
  {name:'Egg Rice & Curry',category:0,lkr:850,eur:3,recipe:[...rice,[5,2]]},
  {name:'Chicken Biriyani',category:0,lkr:1400,eur:5,recipe:[[0,.18],[1,.15],[3,.07],[8,.025],[5,1]]},
  {name:'Coconut Yellow Rice',category:0,lkr:850,eur:3,recipe:[[0,.18],[6,.08],[3,.1],[8,.015]]},
  {name:'Chicken Kottu',category:1,lkr:1200,eur:5,large:[1750,7],recipe:[...kottu,[1,.12]]},
  {name:'Egg Kottu',category:1,lkr:1000,eur:4,recipe:[...kottu,[5,1]]},
  {name:'Vegetable Kottu',category:1,lkr:900,eur:4,large:[1300,6],recipe:[[4,.2],[3,.16],[8,.02]]},
  {name:'Chicken Fried Rice',category:2,lkr:1100,eur:4,large:[1600,6],recipe:[...fried,[1,.12]]},
  {name:'Egg Fried Rice',category:2,lkr:950,eur:4,recipe:fried},
  {name:'Seafood Fried Rice',category:2,lkr:1800,eur:7,recipe:[...fried,[2,.16]]},
  {name:'Chicken Noodles',category:2,lkr:1100,eur:4,recipe:[[4,.15],[1,.12],[3,.08],[8,.02]]},
  {name:'Vegetable Noodles',category:2,lkr:850,eur:3,large:[1250,5],recipe:[[4,.18],[3,.15],[8,.02]]},
  {name:'Devilled Chicken',category:3,lkr:1600,eur:6,recipe:[[1,.22],[3,.12],[8,.025],[9,.01]]},
  {name:'Devilled Fish',category:3,lkr:1800,eur:7,recipe:[[2,.22],[3,.12],[8,.025],[9,.01]]},
  {name:'Plain Hoppers',category:4,lkr:100,eur:1,recipe:[[4,.05],[6,.025],[8,.003]]},
  {name:'Egg Hopper',category:4,lkr:250,eur:1,recipe:[[4,.05],[6,.025],[5,1],[8,.003]]},
  {name:'String Hoppers & Dhal',category:4,lkr:650,eur:3,recipe:[[4,.14],[7,.06],[6,.05]]},
  {name:'Coconut Roti',category:4,lkr:150,eur:1,recipe:[[4,.08],[6,.035],[8,.005]]},
  {name:'Watalappan',category:5,lkr:450,eur:2,recipe:[[5,1],[6,.08],[9,.04]]},
  {name:'Curd & Treacle',category:5,lkr:500,eur:2,recipe:[[13,.15],[9,.04]]},
  {name:'Seasonal Fruit Bowl',category:5,lkr:650,eur:3,recipe:[[12,.25],[9,.01]]},
  {name:'Ceylon Milk Tea',category:6,lkr:250,eur:1,recipe:[[10,.004],[13,.12],[9,.02]]},
  {name:'Fresh Lime Cooler',category:6,lkr:350,eur:2,recipe:[[12,.08],[9,.025]]},
  {name:'House Filter Coffee',category:6,lkr:450,eur:2,recipe:[[11,.012],[13,.08],[9,.01]]},
  {name:'Bottled Water 500 ml',category:6,lkr:150,eur:1,stockCost:[85,.35]},
  {name:'Ginger Beer 330 ml',category:6,lkr:300,eur:2,stockCost:[175,.65]},
  {name:'Cola 330 ml',category:6,lkr:300,eur:2,stockCost:[170,.6]},
  {name:'King Coconut Drink',category:6,lkr:350,eur:2,stockCost:[190,.7]}
];

export function buildPlan(anchor: Anchor): Plan {
  if (!['LKR','EUR'].includes(anchor.currency)) throw new Error('Only explicit LKR/EUR native demo price lists are defined; no exchange rate is assumed.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(anchor.asOf) || !/^\d{2}:\d{2}$/.test(anchor.cutoff)) throw new Error('Invalid seed date/cutoff.');
  if (!mongoose.isValidObjectId(anchor.actorId)) throw new Error('An existing actor reference is required.');
  const cutoff = Number(anchor.cutoff.slice(0,2))*60 + Number(anchor.cutoff.slice(3));
  if (cutoff < 30 || cutoff > 23*60+59 || Number(anchor.cutoff.slice(3)) > 59) throw new Error('Cutoff must be 00:30–23:59 Colombo time.');
  const dates = demoDates(anchor.asOf), entries: Entry[] = [], actor = new mongoose.Types.ObjectId(anchor.actorId);
  const at = (date: string, minute: number) => zonedDateTimeToUtc({...parseDateOnlyParts(date,'Asia/Colombo'),hour:Math.floor(minute/60),minute:minute%60,second:0},0,'Asia/Colombo');
  const start = at(dates[0],0), end = at(anchor.asOf,cutoff);
  const add = (model: string, key: string, values: Row, stamp = start) => {
    const doc: Row = {_id:oid(key), ...values, createdAt:stamp, updatedAt:stamp, __v:0};
    entries.push({model,key,doc}); return doc;
  };
  const native = (lkr: number, eur: number) => anchor.currency === 'LKR' ? lkr : eur;
  let state = RANDOM_SEED;
  const random = () => { state = (Math.imul(state,1664525)+1013904223)>>>0; return state/4294967296; };
  ['Mass','Volume','Count'].forEach(name=>add('BaseUnit',`base/${name}`,{BaseUnitName:`Demo · ${name}`,description:`${NAMESPACE}: measurement family`}));
  const units = ['kg','l','pcs'].map((shortName,i)=>add('Unit',`unit/${shortName}`,{unitName:`Demo · ${['Kilogram','Litre','Piece'][i]}`,shortName,businessType:'restaurant'}));
  const warehouses = ['Service counter','Dry store'].map(name=>add('Warehouse',`warehouse/${name}`,{name:`Demo · ${name}`,country:'Sri Lanka',location:'Fictional Colombo restaurant',isActive:true}));
  const counter = String(warehouses[0]._id), store = String(warehouses[1]._id);
  const categories = ['Rice & curry','Kottu','Rice & noodles','Chef specials','Hoppers & roti','Desserts','Drinks','Ingredients'].map(name=>add('Category',`category/${name}`,{category:`Demo · ${name}`,description:`${NAMESPACE}: fictional restaurant data`}));
  const brands = ['Island Kitchen','Ceylon Refreshments','Pantry'].map(name=>add('Brand',`brand/${name}`,{brandName:`Demo · ${name}`,description:NAMESPACE}));
  const suppliers = ['Lanka Harvest Produce','Hill Country Pantry','Island Beverage Supply','Coastal Fresh Foods'].map((name,i)=>add('Supplier',`supplier/${i}`,{name:`Demo · ${name}`,companyName:`Fictional supplier ${i+1}`,mobile:`00000000${String(i+1).padStart(2,'0')}`}));
  const customerNames = ['Walk-in guest','Nimal Perera','Ayesha Silva','Ruwan Jayasinghe','Tharushi Fernando','Dinesh Kumara','Malini Dias','Sahan Wijesinghe','Nadeesha Senanayake','Kavindu Samarasinghe','Hiruni de Alwis','Fazal Rahman','Sanduni Peiris','Pradeep Bandara','Anjali Rodrigo','Isuru Gunasekara','Office lunch group','Weekend family table'];
  const customers = customerNames.map((name,i)=>add('Customer',`customer/${i}`,{name:`Demo · ${name}`,mobile:`000000${String(i+1).padStart(4,'0')}`,address:'Fictional customer; portfolio demonstration only'}));
  add('Variation','variation/portion',{variationName:'Demo Portions',normalizedName:'demoportions',variationType:['regular','large']});
  const expenseCategories = ['Cleaning & consumables','Utilities','Transport','Gas & maintenance','Rent'].map((name,i)=>add('ExpenseCategory',`expense-category/${i}`,{name:`Demo · ${name}`,description:NAMESPACE}));
  const rawCost = raw.map(r=>native(r[2],r[3]));
  const ingredientProducts = raw.map((r,i)=>add('Product',`ingredient-product/${i}`,{name:`Demo · ${r[0]}`,code:`SSDEMO14-I${String(i+1).padStart(3,'0')}`,category:String(categories[7]._id),brand:String(brands[2]._id),unit:String(units[['kg','l','pcs'].indexOf(r[1])]._id),saleUnit:String(units[['kg','l','pcs'].indexOf(r[1])]._id),purchase:String(units[['kg','l','pcs'].indexOf(r[1])]._id),supplier:String(suppliers[i%4]._id),ptype:'Single',status:'Pending',isInventory:true,note:`${NAMESPACE}: raw ingredient, not a sellable menu item`,warehouse:{[store]:{warehouseName:warehouses[1].name,productQty:0,productCost:rawCost[i],productPrice:money(rawCost[i]*1.3),stockAlert:r[1]==='pcs'?5:.25,batches:[]}}}));
  const kitchen = raw.map((r,i)=>add('KitchenInventoryProduct',`kitchen/${i}`,{name:`Demo · ${r[0]}`,unitId:units[['kg','l','pcs'].indexOf(r[1])]._id,inventoryProductId:ingredientProducts[i]._id,currentStock:0,averageCost:rawCost[i],lastPurchasePrice:rawCost[i],minStockLevel:r[1]==='pcs'?10:.25,description:`${NAMESPACE}: starts at zero; all receipts and recipe issues are recorded`}));
  const recipeCost = (spec: RecipeSpec,scale=1) => money(spec.reduce((sum,[i,q])=>sum+q*scale*rawCost[i],0));
  const menuProducts = menu.map((m,i)=>{
    const price = native(m.lkr,m.eur), cost = m.recipe?recipeCost(m.recipe):native(...m.stockCost!);
    const wh: Row = {warehouseName:warehouses[0].name,productCost:cost,productPrice:price,productProfit:money(price-cost),profitMargin:(price-cost)/price*100,batches:[]};
    if (m.stockCost) Object.assign(wh,{productQty:0,stockAlert:8});
    if (m.large) wh.variationValues = Object.fromEntries(['regular','large'].map((portion,j)=>{
      const portionPrice=j?native(m.large![0],m.large![1]):price,portionCost=recipeCost(m.recipe!,j?1.5:1);
      return [`Demo Portions=${portion}`,{productPrice:portionPrice,productCost:portionCost,productProfit:money(portionPrice-portionCost),profitMargin:(portionPrice-portionCost)/portionPrice*100}];
    }));
    return add('Product',`menu/${i}`,{name:m.name,code:`SSDEMO14-M${String(i+1).padStart(3,'0')}`,brand:String(brands[m.stockCost?1:0]._id),category:String(categories[m.category]._id),unit:String(units[2]._id),saleUnit:String(units[2]._id),purchase:String(units[2]._id),ptype:m.large?'Variation':'Single',...(m.large?{variation:'Demo Portions'}:{}),status:'Active',isInventory:!!m.stockCost,note:`${NAMESPACE}: fictional menu; prices are native ${anchor.currency}, not an FX conversion`,warehouse:{[counter]:wh}});
  });
  menu.forEach((m,i)=>{
    if (!m.recipe) return;
    const portions=m.large?['regular','large']:[null];
    portions.forEach((portion,j)=>add('KitchenRecipe',`recipe/${i}/${portion||'base'}`,{productId:menuProducts[i]._id,variationName:portion?`Demo Portions=${portion}`:null,ingredients:m.recipe!.map(([k,q])=>({kitchenProductId:kitchen[k]._id,ingredientName:kitchen[k].name,quantity:quantity(q*(j?1.5:1)),unit:raw[k][1]}))}));
  });
  // Build tickets before receipts so weekly purchases exactly cover their demand.
  const tickets=dates.map((date,day)=>{
    const closeMinute=date===anchor.asOf?cutoff:20*60, openMinute=Math.min(8*60,Math.floor(closeMinute*.3));
    const weekend=[0,6].includes(new Date(date+'T12:00:00Z').getUTCDay());
    const count=6+Math.floor(random()*5)+(weekend?4:0);
    return Array.from({length:count},(_,s)=>{
      const chosen=new Set<number>();while(chosen.size<2+Math.floor(random()*2))chosen.add(Math.floor(random()*menu.length));
      const lines=[...chosen].map(i=>({i,qty:1+Math.floor(random()*3),large:!!menu[i].large&&random()>.5}));
      const minute=Math.floor(openMinute+4+(closeMinute-openMinute-8)*(s+1)/(count+1));
      return {date,day,s,openMinute,closeMinute,stamp:at(date,minute),lines};
    });
  });
  const storeStock=raw.map(()=>0), kitchenStock=raw.map(()=>0), bottleStock=menu.map(()=>0);
  let purchaseSequence=0, adjustmentSequence=0;
  const saleDocs: Row[]=[], sessionDocs: Row[]=[];
  const denominations=(amount:number) => {
    if (!Number.isInteger(amount)||amount<0) throw new Error('Demo register cash must be exactly representable by supported whole-unit denominations.');
    const result: Row=Object.fromEntries(['20','50','100','500','1000','5000','1','2','5','10'].map(k=>[k,0]));
    for(const n of anchor.currency==='EUR'?[100,50,20,10,5,2,1]:[5000,1000,500,100,50,20,10,5,2,1]){result[n]=Math.floor(amount/n);amount%=n;}
    return result;
  };
  for(let week=0;week<dates.length;week+=7){
    const until=Math.min(week+7,dates.length), date=dates[week], first=tickets[week][0];
    const rawNeed=raw.map(()=>0),bottleNeed=menu.map(()=>0);
    for(const dayTickets of tickets.slice(week,until))for(const ticket of dayTickets)for(const line of ticket.lines){
      const m=menu[line.i];if(m.recipe)for(const [i,q]of m.recipe)rawNeed[i]=quantity(rawNeed[i]+q*(line.large?1.5:1)*line.qty);else bottleNeed[line.i]+=line.qty;
    }
    const issues=raw.map((r,i)=>quantity(Math.max(0,rawNeed[i]+([10,11].includes(i)?.05:r[1]==='pcs'?20:2)-kitchenStock[i])));
    const purchaseItems: Row[][]=[[],[],[],[]];
    raw.forEach((r,i)=>{
      const target=[10,11].includes(i)?.1:r[1]==='pcs'?12:1;
      const qty=quantity(issues[i]+target-storeStock[i]);if(qty<=0)return;
      purchaseItems[i%4].push({_id:oid(`purchase-item/${week}/raw/${i}`),productId:ingredientProducts[i]._id,quantity:qty,cost:rawCost[i],subTotal:money(qty*rawCost[i])});storeStock[i]=quantity(storeStock[i]+qty);
    });
    menu.forEach((m,i)=>{if(!m.stockCost)return;const target=i===26?3:i===27?4:18,qty=bottleNeed[i]+target-bottleStock[i];if(qty<=0)return;purchaseItems[2].push({_id:oid(`purchase-item/${week}/bottle/${i}`),productId:menuProducts[i]._id,quantity:qty,cost:native(...m.stockCost),subTotal:money(qty*native(...m.stockCost))});bottleStock[i]+=qty;});
    purchaseItems.forEach((items,supplierIndex)=>{
      // Each purchase has a single warehouse; pantry and packaged goods stay separate.
      for(const isBottle of [false,true]){
        const subset=items.filter(item=>menuProducts.some(p=>String(p._id)===String(item.productId))===isBottle);if(!subset.length)continue;
        const total=money(subset.reduce((sum,item)=>sum+item.subTotal,0));
        add('Purchase',`purchase/${week}/${supplierIndex}/${isBottle?'bottle':'raw'}`,{purchaseId:`SSDEMO14-P-${String(++purchaseSequence).padStart(4,'0')}`,supplierId:suppliers[supplierIndex]._id,warehouseId:warehouses[isBottle?0:1]._id,purchaseDate:at(date,Math.max(0,first.openMinute-10)),items:subset,subtotal:total,discount:0,discountType:'fixed',tax:0,taxType:'fixed',grandTotal:total,paymentStatus:'Paid',paymentMethod:'bankTransfer',purchaseStatus:'Received',createdBy:actor},at(date,Math.max(0,first.openMinute-10)));
      }
    });
    const adjustmentId=`SSDEMO14-A-${String(++adjustmentSequence).padStart(4,'0')}`;
    const adjustmentItems=issues.map((qty,i)=>({_id:oid(`issue-item/${week}/${i}`),productId:ingredientProducts[i]._id,productName:ingredientProducts[i].name,productCode:ingredientProducts[i].code,adjustmentQuantity:qty,productCost:rawCost[i],subTotal:money(qty*rawCost[i]),currentStock:storeStock[i],newStock:quantity(storeStock[i]-qty)})).filter(item=>item.adjustmentQuantity>0);
    add('InventoryAdjustment',`issue/${week}`,{adjustmentId,warehouseId:warehouses[1]._id,warehouseName:warehouses[1].name,adjustmentType:'Decrease',adjustmentDate:at(date,first.openMinute-5),items:adjustmentItems,reason:'other',reasonDetails:'Documented issue of purchased pantry stock to kitchen; corresponding manual kitchen receipts share this reference.',referenceNumber:`SSDEMO14-ISSUE-${week}`,notes:NAMESPACE,totalAdjustmentValue:money(adjustmentItems.reduce((sum,item)=>sum+item.subTotal,0)),status:'Completed',createdBy:actor,approvedBy:actor,approvalDate:at(date,first.openMinute-5)},at(date,first.openMinute-5));
    issues.forEach((qty,i)=>{
      if(qty<=0)return;
      storeStock[i]=quantity(storeStock[i]-qty);kitchenStock[i]=quantity(kitchenStock[i]+qty);
      add('KitchenStockMovement',`receipt/${week}/${i}`,{kitchenProductId:kitchen[i]._id,type:'in',quantity:qty,costAtTime:rawCost[i],source:'manual',reason:'transfer',note:`${NAMESPACE}; issue ${adjustmentId}; purchased pantry stock, not unexplained opening stock`,createdBy:actor},at(date,first.openMinute-5));
    });
    for(let d=week;d<until;d++){
      const dayTickets=tickets[d], openingCash=native(5000,100), sessionId=oid(`session/${dates[d]}`), daySales: Row[]=[];
      for(const ticket of dayTickets){
        const needs=raw.map(()=>0), saleId=oid(`sale/${ticket.date}/${ticket.s}`);
        const products=ticket.lines.map(line=>{
          const m=menu[line.i],p=menuProducts[line.i];
          const price=line.large?native(m.large![0],m.large![1]):native(m.lkr,m.eur);
          const cost=m.recipe?recipeCost(m.recipe,line.large?1.5:1):native(...m.stockCost!);
          const stockQtyAtSale=m.stockCost?bottleStock[line.i]:0;
          if(m.stockCost)bottleStock[line.i]-=line.qty;
          else for(const [k,q]of m.recipe!)needs[k]=quantity(needs[k]+q*(line.large?1.5:1)*line.qty);
          return {productId:String(p._id),productName:p.name,variation:m.large?`Demo Portions=${line.large?'large':'regular'}`:null,batch:null,stockQtyAtSale,qty:line.qty,price,discount:0,discountType:'fixed',tax:0,subtotal:money(price*line.qty),cost};
        });
        const total=money(products.reduce((sum,p)=>sum+p.subtotal,0)), cost=money(products.reduce((sum,p)=>sum+p.cost*p.qty,0));
        const method=(ticket.day+ticket.s)%4;
        const cashAmount=method===0?total:method===3?Math.floor(total/2):0;
        const cardAmount=method===1?total:method===3?total-cashAmount:0;
        const bankTransferAmount=method===2?total:0;
        const payments=[['cash',cashAmount],['card',cardAmount],['bankTransfer',bankTransferAmount]].filter(([,value])=>Number(value)>0).map(([paymentType,amount])=>({date:ticket.stamp,reference:`SSDEMO14-PAY-${ticket.date}-${ticket.s}`,paymentType,amount}));
        const sale=add('Sale',`sale/${ticket.date}/${ticket.s}`,{invoiceId:`SSDEMO14-S-${ticket.date.replace(/-/g,'')}-${String(ticket.s+1).padStart(3,'0')}`,serviceType:'takeaway',tableId:'',warehouseId:counter,customerId:String(customers[(ticket.day+ticket.s)%customers.length]._id),date:ticket.stamp,businessType:'restaurant',status:'completed',paymentStatus:'paid',saleType:'pos',products,saleDiscountValue:0,saleDiscountType:'fixed',saleTaxValue:0,shippingCost:0,total,balance:0,profit:money(total-cost),cashAmount,cardAmount,bankTransferAmount,posSessionId:sessionId,payments,createdBy:actor,kitchenDeductionAppliedAt:ticket.stamp,mainStockDeductionAppliedAt:ticket.stamp},ticket.stamp);
        saleDocs.push(sale);daySales.push(sale);
        needs.forEach((qty,k)=>{if(qty<=0)return;kitchenStock[k]=quantity(kitchenStock[k]-qty);if(kitchenStock[k]<0)throw new Error('Negative kitchen stock in simulation.');add('KitchenStockMovement',`consumption/${ticket.date}/${ticket.s}/${k}`,{kitchenProductId:kitchen[k]._id,type:'out',quantity:qty,costAtTime:rawCost[k],source:'sale',saleId,note:`Sale ${sale.invoiceId}`,createdBy:actor},ticket.stamp);});
      }
      const closeTime=at(dates[d],dayTickets[0].closeMinute),cashSales=daySales.reduce((sum,s)=>sum+s.cashAmount,0),closingCash=openingCash+cashSales;
      const session=add('PosSession',`session/${dates[d]}`,{userId:actor,username:'DEMO · Simulated cashier',openTime:at(dates[d],dayTickets[0].openMinute),closeTime,openingCash,closingCash,cashVariance:0,denominations:denominations(openingCash),closingDenominations:denominations(closingCash),status:'CLOSED'},at(dates[d],dayTickets[0].openMinute));session.updatedAt=closeTime;sessionDocs.push(session);
      const amounts=[native(800,2),native(1500,5),native(1000,3),native(4800,15),native(60000,200)];
      const expenseKinds=[0,...(d%3===0?[1]:[]),...(d%2===0?[2]:[]),...(d%7===0?[3]:[]),...(dates[d].endsWith('-01')?[4]:[])];
      expenseKinds.forEach(kind=>add('Expense',`expense/${dates[d]}/${kind}`,{date:at(dates[d],Math.floor((dayTickets[0].openMinute+dayTickets[0].closeMinute)/2)),title:`Demo · ${expenseCategories[kind].name.replace('Demo · ','')}`,warehouse:warehouses[0]._id,category:expenseCategories[kind]._id,amount:amounts[kind],details:`${NAMESPACE}: fictional operating expense; outside the POS cash drawer`,reference:`SSDEMO14-E-${dates[d].replace(/-/g,'')}-${kind}`,createdBy:actor},at(dates[d],Math.floor((dayTickets[0].openMinute+dayTickets[0].closeMinute)/2))));
    }
  }
  raw.forEach((r,i)=>{ingredientProducts[i].warehouse[store].productQty=storeStock[i];ingredientProducts[i].updatedAt=end;kitchen[i].currentStock=kitchenStock[i];kitchen[i].updatedAt=end;});
  menu.forEach((m,i)=>{if(m.stockCost){menuProducts[i].warehouse[counter].productQty=bottleStock[i];if(bottleStock[i]<0)throw new Error('Negative packaged stock.');}menuProducts[i].updatedAt=end;});
  const counts=Object.fromEntries([...new Set(entries.map(e=>e.model))].map(model=>[model,entries.filter(e=>e.model===model).length]));
  return {version:1,namespace:NAMESPACE,anchor,entries,dates,weekdayDates:dates.filter(date=>![0,6].includes(new Date(date+'T12:00:00Z').getUTCDay())).length,summary:{counts,sellableMenuItems:menu.length,ingredientSKUs:raw.length,firstDate:dates[0],lastDate:anchor.asOf,calendarTradingDays:dates.length,totalSales:money(saleDocs.reduce((sum,s)=>sum+s.total,0)),todaySales:saleDocs.filter(s=>s.invoiceId.includes(anchor.asOf.replace(/-/g,''))).length,closedRegisters:sessionDocs.length,openingStock:0,currency:anchor.currency}};
}
