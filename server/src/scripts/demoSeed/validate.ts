import mongoose from 'mongoose';
mongoose.set('autoCreate', false);
mongoose.set('autoIndex', false);
import BaseUnit from '../../models/BaseUnit';
import Brand from '../../models/Brand';
import Category from '../../models/Category';
import Customer from '../../models/Customer';
import Expense from '../../models/Expense';
import ExpenseCategory from '../../models/ExpenseCategory';
import InventoryAdjustment from '../../models/InventoryAdjustment';
import KitchenInventoryProduct from '../../models/KitchenInventoryProduct';
import KitchenRecipe from '../../models/KitchenRecipe';
import KitchenStockMovement from '../../models/KitchenStockMovement';
import PosSession from '../../models/PosSession';
import Product from '../../models/Product';
import Purchase from '../../models/Purchase';
import Sale from '../../models/Sale';
import Supplier from '../../models/Supplier';
import Unit from '../../models/Unit';
import Variation from '../../models/Variation';
import Warehouse from '../../models/Warehouse';
import Role from '../../models/Role';
import User from '../../models/User';
import { Entry, money, Plan, quantity, Row } from './plan';
import { assertDemoIdentity } from './identity';

export const models: Record<string, mongoose.Model<any>> = { Role, User, BaseUnit, Unit, Warehouse, Category, Brand, Supplier, Customer, Variation, ExpenseCategory, Product, KitchenInventoryProduct, KitchenRecipe, PosSession, Purchase, InventoryAdjustment, Sale, KitchenStockMovement, Expense };
const ensure = (condition: unknown, message: string) => { if (!condition) throw new Error(message); };
const equal = (a: number,b: number,message: string,tolerance=.00001) => ensure(Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)<=tolerance,message);

/** Real schema validation, including pre-validate hooks; never saves or invokes workflow side effects. */
export async function validateSchemas(plan: Plan): Promise<void> {
  for (let start=0;start<plan.entries.length;start+=100) {
    await Promise.all(plan.entries.slice(start,start+100).map(async entry=>{
      try {
        const document = new models[entry.model](entry.doc, undefined, {strict:'throw'});
        await document.validate();
        entry.doc = document.toObject({flattenMaps:true});
      } catch { throw new Error(`Schema validation failed: ${entry.model} seed key ${entry.key}`); }
    }));
  }
}

export function reconcile(plan: Plan): Row {
  if(plan.entries.some(e=>e.model==='User'||e.model==='Role'))assertDemoIdentity(plan);
  const rows=(model: string)=>plan.entries.filter(e=>e.model===model).map(e=>e.doc);
  const byModel=Object.fromEntries(Object.keys(models).map(model=>[model,new Map(rows(model).map(doc=>[String(doc._id),doc]))]));
  const lookup=(model:string,id:unknown): Row=>{const doc=byModel[model]?.get(String(id));ensure(doc,`Missing ${model} seed reference`);return doc!;};
  const ids=new Set<string>();
  for(const entry of plan.entries){
    const id=`${entry.model}/${entry.doc._id}`;ensure(!ids.has(id),'Duplicate planned identity');ids.add(id);
    ensure(entry.doc.createdAt instanceof Date && entry.doc.updatedAt instanceof Date,'Explicit timestamps required');
    // Schema refs include embedded recipe/purchase/adjustment references.
    const visit=(schema:mongoose.Schema,obj:Row)=>{
      schema.eachPath((key,field:any)=>{
        const value=obj[key];if(value==null)return;
        if(field.options?.ref){if(field.options.ref==='User')ensure(String(value)===plan.anchor.actorId,'Unexpected account reference');else lookup(field.options.ref,value);}
        if(field.schema){for(const nested of Array.isArray(value)?value:[value])visit(field.schema,nested);}
      });
    };visit(models[entry.model].schema,entry.doc);
  }
  const stock=new Map<string,number>(), kitchenStock=new Map<string,number>();
  const stockKey=(pid:unknown,wh:unknown)=>`${pid}/${wh}`;
  const bump=(map:Map<string,number>,key:string,delta:number)=>{const value=quantity((map.get(key)||0)+delta);ensure(value>=-.000001,'Unexplained negative stock in chronological ledger');map.set(key,value);};
  for(const p of rows('Product')){
    for(const model of ['Category','Brand','Unit'])lookup(model,p[{Category:'category',Brand:'brand',Unit:'unit'}[model]!]);
    for(const [wh,value]of Object.entries<Row>(p.warehouse)){
      ensure(lookup('Warehouse',wh).name===value.warehouseName,'Warehouse name/id mismatch');
      ensure(value.productCost>=0&&value.productPrice>=value.productCost,'Invalid price/cost');
      if(p.isInventory){ensure(value.productQty>=0&&value.stockAlert>=0,'Inventory quantity/alert missing');stock.set(stockKey(p._id,wh),0);}
      for(const v of Object.values<Row>(value.variationValues||{}))ensure(v.productPrice>=v.productCost&&v.productCost>=0,'Invalid variation price/cost');
    }
  }
  for(const k of rows('KitchenInventoryProduct'))kitchenStock.set(String(k._id),0);
  const recipeMap=new Map(rows('KitchenRecipe').map(r=>[`${r.productId}/${r.variationName||''}`,r]));
  const actualNeeds=new Map<string,number>();
  const saleRows=rows('Sale');
  for(const sale of saleRows){
    lookup('Warehouse',sale.warehouseId);lookup('Customer',sale.customerId);const session=lookup('PosSession',sale.posSessionId);
    ensure(sale.date.getTime()===sale.createdAt.getTime(),'Sale business date/timestamp mismatch');
    ensure(sale.date>=session.openTime&&sale.date<=session.closeTime,'Sale outside register interval');
    let total=0,cost=0;
    for(const line of sale.products){
      const p=lookup('Product',line.productId),wh=p.warehouse[sale.warehouseId];ensure(wh,'Sale warehouse price missing');
      ensure(line.qty>0,'Non-positive sale quantity');equal(line.subtotal,money(line.qty*line.price),'Sale line subtotal mismatch');
      const v=line.variation?wh.variationValues?.[line.variation]:wh;ensure(v,'Variation identity mismatch');
      equal(line.price,v.productPrice,'Sale price snapshot mismatch');equal(line.cost,v.productCost,'Sale cost snapshot mismatch');
      ensure(line.discount===0&&line.tax===0,'Unsupported seed line financial rule');
      total+=line.subtotal;cost+=line.cost*line.qty;
      if(!p.isInventory){const recipe=recipeMap.get(`${p._id}/${line.variation||''}`);ensure(recipe,'Missing exact portion recipe');
        let unitRecipeCost=0;
        for(const ingredient of recipe!.ingredients){const kp=lookup('KitchenInventoryProduct',ingredient.kitchenProductId);ensure(lookup('Unit',kp.unitId).shortName===ingredient.unit,'Unsupported unit conversion');const key=`${sale._id}/${kp._id}`;actualNeeds.set(key,quantity((actualNeeds.get(key)||0)+ingredient.quantity*line.qty));unitRecipeCost+=ingredient.quantity*kp.averageCost;}
        equal(line.cost,money(unitRecipeCost),'Rounded recipe unit cost mismatch');
      }
    }
    equal(sale.total,money(total),'Sale total mismatch');equal(sale.profit,money(total-cost),'Sale profit/cost mismatch');
    ensure(sale.saleDiscountValue===0&&sale.saleTaxValue===0&&sale.shippingCost===0,'Seed must not invent conflicting financial rules');
    equal(sale.cashAmount+sale.cardAmount+sale.bankTransferAmount,sale.total,'Payment/change mismatch');
    equal(sale.payments.reduce((sum:number,p:Row)=>sum+p.amount,0),sale.total,'Payment history mismatch');
    for(const [type,field]of [['cash','cashAmount'],['card','cardAmount'],['bankTransfer','bankTransferAmount']])equal(sale.payments.filter((p:Row)=>p.paymentType===type).reduce((sum:number,p:Row)=>sum+p.amount,0),sale[field],'Payment method/history mismatch');
    ensure(sale.balance===0&&sale.paymentStatus==='paid'&&sale.status==='completed','Unexpected settlement state');
    ensure(sale.mainStockDeductionAppliedAt&&sale.kitchenDeductionAppliedAt,'Idempotency markers required');
  }
  const events: Array<{date:Date;rank:number;doc:Row;kind:string}>=[];
  for(const p of rows('Purchase')){
    equal(p.items.reduce((sum:number,i:Row)=>sum+i.subTotal,0),p.subtotal,'Purchase subtotal mismatch',.011);
    equal(p.subtotal,p.grandTotal,'Purchase total mismatch');ensure(p.paymentStatus==='Paid'&&p.purchaseStatus==='Received','Only paid received demo purchases supported');
    ensure(p.purchaseDate.getTime()===p.createdAt.getTime(),'Purchase date/timestamp mismatch');
    for(const item of p.items){const product=lookup('Product',item.productId);ensure(product.isInventory===true,'Cannot purchase a prepared dish');equal(item.subTotal,money(item.quantity*item.cost),'Purchase line value mismatch');ensure(item.quantity>0&&item.cost>0,'Invalid purchase quantity/cost');}
    events.push({date:p.purchaseDate,rank:0,doc:p,kind:'purchase'});
  }
  const receiptByIssue=new Map<string,number>();
  for(const m of rows('KitchenStockMovement')){
    ensure(m.quantity>0,'Non-positive kitchen movement');const kp=lookup('KitchenInventoryProduct',m.kitchenProductId);
    equal(m.costAtTime,kp.averageCost,'Kitchen movement valuation mismatch');
    if(m.source==='sale'){
      lookup('Sale',m.saleId);const key=`${m.saleId}/${m.kitchenProductId}`;ensure(actualNeeds.has(key),'Unexpected recipe consumption movement');equal(m.quantity,actualNeeds.get(key)!,'Recipe consumption mismatch');actualNeeds.delete(key);
    }else{ensure(m.type==='in'&&m.reason==='transfer','Unsupported stock source');const ref=String(m.note).match(/issue (SSDEMO14-A-\d+)/)?.[1];ensure(ref,'Kitchen receipt requires issue reference');receiptByIssue.set(`${ref}/${kp.inventoryProductId}`,m.quantity);}
    events.push({date:m.createdAt,rank:2,doc:m,kind:'movement'});
  }
  ensure(actualNeeds.size===0,'Missing recipe consumption movements');
  for(const a of rows('InventoryAdjustment')){
    ensure(a.adjustmentType==='Decrease'&&a.status==='Completed','Only documented kitchen issues supported');
    equal(a.totalAdjustmentValue,money(a.items.reduce((sum:number,i:Row)=>sum+i.subTotal,0)),'Stock issue valuation mismatch');
    for(const item of a.items){equal(item.newStock,item.currentStock-item.adjustmentQuantity,'Issue balance mismatch');equal(item.subTotal,money(item.adjustmentQuantity*item.productCost),'Issue line cost mismatch');equal(item.adjustmentQuantity,receiptByIssue.get(`${a.adjustmentId}/${item.productId}`)!,'Pantry issue/kitchen receipt mismatch');receiptByIssue.delete(`${a.adjustmentId}/${item.productId}`);}
    events.push({date:a.adjustmentDate,rank:1,doc:a,kind:'issue'});
  }
  ensure(receiptByIssue.size===0,'Unexplained kitchen receipts');
  for(const s of saleRows)events.push({date:s.date,rank:3,doc:s,kind:'sale'});
  events.sort((a,b)=>a.date.getTime()-b.date.getTime()||a.rank-b.rank);
  for(const {kind,doc}of events){
    if(kind==='purchase')for(const i of doc.items)bump(stock,stockKey(i.productId,doc.warehouseId),i.quantity);
    if(kind==='issue')for(const i of doc.items){equal(stock.get(stockKey(i.productId,doc.warehouseId))||0,i.currentStock,'Historical issue stock mismatch');bump(stock,stockKey(i.productId,doc.warehouseId),-i.adjustmentQuantity);}
    if(kind==='movement')bump(kitchenStock,String(doc.kitchenProductId),doc.type==='in'?doc.quantity:-doc.quantity);
    if(kind==='sale')for(const line of doc.products){const p=lookup('Product',line.productId);if(p.isInventory){const key=stockKey(p._id,doc.warehouseId);equal(stock.get(key)||0,line.stockQtyAtSale,'Stock-at-sale snapshot mismatch');bump(stock,key,-line.qty);}}
  }
  for(const p of rows('Product'))if(p.isInventory)for(const [wh,data]of Object.entries<Row>(p.warehouse))equal(data.productQty,stock.get(stockKey(p._id,wh))||0,'Final purchased stock mismatch');
  for(const k of rows('KitchenInventoryProduct'))equal(k.currentStock,kitchenStock.get(String(k._id))||0,'Final ingredient stock mismatch');
  for(const s of rows('PosSession')){
    const sales=saleRows.filter(sale=>String(sale.posSessionId)===String(s._id));ensure(sales.length>0,'Empty demo register');ensure(s.status==='CLOSED','Never create a demo open register');
    const cash=sales.reduce((sum,sale)=>sum+sale.cashAmount,0);equal(s.closingCash,s.openingCash+cash,'Register cash total mismatch');equal(s.cashVariance,0,'Register variance mismatch');
    for(const [field,total]of [['denominations',s.openingCash],['closingDenominations',s.closingCash]] as Array<[string,number]>){for(const count of Object.values<number>(s[field]))ensure(Number.isInteger(count)&&count>=0,'Fractional register denomination');equal(Object.entries<number>(s[field]).reduce((sum,[unit,count])=>sum+Number(unit)*count,0),total,'Register denominations mismatch');}
  }
  const days=new Set(saleRows.map(s=>s.invoiceId.slice('SSDEMO14-S-'.length,'SSDEMO14-S-'.length+8)));
  ensure(days.size===plan.dates.length,'Missing daily activity');
  const lowStock=rows('Product').filter(p=>p.isInventory&&Object.values<Row>(p.warehouse).some(w=>w.productQty<=w.stockAlert)).length;
  const lowKitchen=rows('KitchenInventoryProduct').filter(k=>k.currentStock<=k.minStockLevel).length;
  ensure(lowStock>=2&&lowKitchen>=2,'Low-stock examples missing');
  return {validatedDocuments:plan.entries.length,referentialIntegrity:true,chronologicalStock:true,recipeConsumption:true,purchasesAndIssues:true,paymentsAndCash:true,lowStockProducts:lowStock,lowKitchenIngredients:lowKitchen,...plan.summary};
}
