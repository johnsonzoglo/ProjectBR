import { Controller, Get, Query, Req } from "@nestjs/common";
import type { Request } from "express";
import { requireUser } from "../permissions/access.js";

const countryCurrencies: Record<string,string> = {
  AE:"AED",US:"USD",GB:"GBP",CA:"CAD",AU:"AUD",NZ:"NZD",EU:"EUR",DE:"EUR",FR:"EUR",ES:"EUR",IT:"EUR",NL:"EUR",BE:"EUR",IE:"EUR",PT:"EUR",AT:"EUR",FI:"EUR",GR:"EUR",
  IN:"INR",PK:"PKR",BD:"BDT",LK:"LKR",NP:"NPR",PH:"PHP",ID:"IDR",MY:"MYR",SG:"SGD",TH:"THB",VN:"VND",JP:"JPY",KR:"KRW",CN:"CNY",HK:"HKD",TW:"TWD",
  ZA:"ZAR",NG:"NGN",KE:"KES",GH:"GHS",TZ:"TZS",UG:"UGX",EG:"EGP",MA:"MAD",SA:"SAR",QA:"QAR",KW:"KWD",BH:"BHD",OM:"OMR",JO:"JOD",IL:"ILS",TR:"TRY",
  BR:"BRL",MX:"MXN",AR:"ARS",CL:"CLP",CO:"COP",PE:"PEN",CH:"CHF",SE:"SEK",NO:"NOK",DK:"DKK",PL:"PLN",CZ:"CZK",HU:"HUF",RO:"RON"
};
const rateCache = new Map<string,{rate:number;date:string;expiresAt:number}>();

@Controller("api/v1/currency")
export class CurrencyController {
  @Get()
  async currency(@Req() req:Request,@Query("country") browserCountry="") {
    const {user}=await requireUser(req);
    const header=String(req.headers["cf-ipcountry"]||"").toUpperCase();
    const country=(user.countryCode||(!["XX","T1"].includes(header)&&header)||browserCountry).toUpperCase().slice(0,2);
    const currency=user.currencyCode||countryCurrencies[country]||"USD";
    const language=user.languageCode||"en";
    if(currency==="USD") return {country:country||"US",currency,language,rate:1,base:"USD",updatedAt:new Date().toISOString(),source:"base"};
    const cached=rateCache.get(currency);
    if(cached&&cached.expiresAt>Date.now()) return {country:country||null,currency,language,rate:cached.rate,base:"USD",updatedAt:cached.date,source:"Frankfurter"};
    try {
      const response=await fetch(`https://api.frankfurter.dev/v2/rate/USD/${encodeURIComponent(currency)}`,{headers:{Accept:"application/json"},signal:AbortSignal.timeout(4000)});
      if(!response.ok) throw new Error("rate unavailable");
      const result=await response.json() as {rate?:number;date?:string};
      if(!result.rate||!Number.isFinite(result.rate)) throw new Error("invalid rate");
      rateCache.set(currency,{rate:result.rate,date:result.date||new Date().toISOString(),expiresAt:Date.now()+6*60*60*1000});
      return {country:country||null,currency,language,rate:result.rate,base:"USD",updatedAt:result.date||new Date().toISOString(),source:"Frankfurter"};
    } catch { return {country:country||null,currency:"USD",language,rate:1,base:"USD",updatedAt:new Date().toISOString(),source:"fallback"}; }
  }
}
