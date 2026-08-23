import { useEffect, useState } from "react";import{api}from"./api";
export default function GlobalBrand(){const[logo,setLogo]=useState("");useEffect(()=>{api.get("/pricing-settings").then(r=>setLogo(r.data?.data?.logoUrl||"")).catch(()=>{})},[]);return logo?<img className="global-brand-logo" src={logo} alt="LocalPintu logo"/>:<>LOCAL<span>PINTU</span></>}
