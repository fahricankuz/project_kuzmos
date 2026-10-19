/* ═══════════ MAĞAZA PANELİ ═══════════ */
var panelChartInst=null;

/** Bir siparişin dönem kasasını ürün satırlarının brüt payına göre dağıtır. */
function siparisKirilim(s,donem,anahtarFn){
  var akis=siparisNakitAkis(s,donem);
  if(Math.abs(akis.kasa)<0.005)return {};
  var ara=siparisAraToplam(s);
  if(ara<=0)return {};
  var iskonto=pTR(s.tutar)/ara; if(!isFinite(iskonto)||iskonto<0)iskonto=1;
  var gruplar={}, toplamBrut=0;
  (s.urunler||[]).forEach(function(p){
    var line=urunSatirToplam(p); if(line<=0)return;
    var anahtar=anahtarFn(p)||'Belirtilmemiş';
    var brut=line*iskonto;
    if(!gruplar[anahtar])gruplar[anahtar]={brut:0,adet:0};
    gruplar[anahtar].brut+=brut;
    gruplar[anahtar].adet+=parseInt(p.adet,10)||1;
    toplamBrut+=brut;
  });
  if(toplamBrut<=0)return {};
  var sonuc={};
  Object.keys(gruplar).forEach(function(k){
    var pay=gruplar[k].brut/toplamBrut;
    sonuc[k]={kasa:akis.kasa*pay,kdv:akis.kdv*pay,komisyon:akis.komisyon*pay,net:akis.net*pay,adet:gruplar[k].adet};
  });
  return sonuc;
}

function tabloSatiriTopla(hedef,anahtar,veri){
  if(!hedef[anahtar])hedef[anahtar]={kasa:0,kdv:0,komisyon:0,net:0,adet:0,siparis:0,indirimAgirlik:0,indirimToplam:0};
  hedef[anahtar].kasa+=veri.kasa||0;
  hedef[anahtar].kdv+=veri.kdv||0;
  hedef[anahtar].komisyon+=veri.komisyon||0;
  hedef[anahtar].net+=veri.net||0;
  hedef[anahtar].adet+=veri.adet||0;
}

function performansTablosu(satirlar,baslik,adetBasligi){
  var anahtarlar=Object.keys(satirlar).sort(function(a,b){return satirlar[b].kasa-satirlar[a].kasa;});
  var toplam={kasa:0,kdv:0,komisyon:0,net:0,adet:0,siparis:0,indirimAgirlik:0,indirimToplam:0};
  var gövde='';
  anahtarlar.forEach(function(k){
    var v=satirlar[k];
    if(Math.abs(v.kasa)<0.005&&!v.adet&&!v.siparis)return;
    ['kasa','kdv','komisyon','net','adet','siparis','indirimAgirlik','indirimToplam'].forEach(function(f){toplam[f]+=v[f]||0;});
    var bolen=v.siparis||v.adet||1;
    var indirim=v.indirimAgirlik>0?Math.round(v.indirimToplam/v.indirimAgirlik):null;
    gövde+='<tr><td style="font-weight:600">'+esc(k)+'</td>'
      +'<td class="num">'+(v.siparis||v.adet||0)+'</td>'
      +'<td class="num" style="color:var(--green);font-weight:600">'+fTR(v.kasa)+'</td>'
      +'<td class="num" style="color:var(--gray-600)">'+fTR(v.kdv)+'</td>'
      +'<td class="num" style="color:var(--gray-600)">'+fTR(v.komisyon)+'</td>'
      +'<td class="num" style="font-weight:700">'+fTR(v.net)+'</td>'
      +'<td class="num">'+fTR(v.net/bolen)+'</td>'
      +'<td class="num" style="color:var(--gray-600)">'+(indirim===null?'—':'%'+indirim)+'</td></tr>';
  });
  if(!gövde)gövde='<tr><td colspan="8" style="text-align:center;color:var(--gray-400);padding:26px">Bu dönem için veri yok.</td></tr>';
  var tBolen=toplam.siparis||toplam.adet||1;
  var tIndirim=toplam.indirimAgirlik>0?Math.round(toplam.indirimToplam/toplam.indirimAgirlik):null;
  return '<table class="tbl"><thead><tr><th>'+baslik+'</th><th class="num">'+adetBasligi+'</th><th class="num">Kasa</th>'
    +'<th class="num">KDV</th><th class="num">Kom.+Prim</th><th class="num">Net</th><th class="num">Net Ort.</th><th class="num">İndirim</th></tr></thead>'
    +'<tbody>'+gövde+'</tbody><tfoot><tr><td>Toplam</td><td class="num">'+(toplam.siparis||toplam.adet||0)+'</td>'
    +'<td class="num" style="color:var(--green)">'+fTR(toplam.kasa)+'</td><td class="num">'+fTR(toplam.kdv)+'</td>'
    +'<td class="num">'+fTR(toplam.komisyon)+'</td><td class="num">'+fTR(toplam.net)+'</td>'
    +'<td class="num">'+fTR(toplam.net/tBolen)+'</td><td class="num">'+(tIndirim===null?'—':'%'+tIndirim)+'</td></tr></tfoot></table>';
}

function panelCiz(){
  if(!document.getElementById('panelPersonelTablo'))return;
  donemEtiketleriGuncelle();
  var ay=donemAy(), yil=donemYil();
  var siparisler=aktifSiparisler();

  var ciro=0, siparisAdet=0, alacak=0, alacakAdet=0, gunluk={};
  var personelTablo={}, kategoriTablo={}, markaTablo={};
  var kasa=0,kdv=0,kom=0,net=0;

  siparisler.forEach(function(s){
    var akis=siparisNakitAkis(s,ay);
    kasa+=akis.kasa; kdv+=akis.kdv; kom+=akis.komisyon; net+=akis.net;

    if(String(s.siparisTarihi).indexOf(ay)===0){
      ciro+=pTR(s.tutar); siparisAdet++;
    }
    var kalan=siparisKalan(s);
    if(pTR(s.tutar)>0&&kalan>0.005){ alacak+=kalan; alacakAdet++; }

    (s.odemeler||[]).forEach(function(o){
      if(String(o.tarih).indexOf(ay)!==0)return;
      var gun=parseInt(String(o.tarih).substring(8,10),10);
      gunluk[gun]=(gunluk[gun]||0)+(o.tip==='iade'?-1:1)*pTR(o.tutar);
    });

    /* Personel kırılımı */
    if(Math.abs(akis.kasa)>0.005){
      var kisi=s.personel||'Belirtilmemiş';
      tabloSatiriTopla(personelTablo,kisi,akis);
    }
    if(String(s.siparisTarihi).indexOf(ay)===0){
      var kisi2=s.personel||'Belirtilmemiş';
      if(!personelTablo[kisi2])tabloSatiriTopla(personelTablo,kisi2,{});
      personelTablo[kisi2].siparis++;
      var ara=siparisAraToplam(s);
      if(ara>0){
        var ind=pTR(s.tutar)<ara?((ara-pTR(s.tutar))/ara)*100:0;
        personelTablo[kisi2].indirimAgirlik+=ara;
        personelTablo[kisi2].indirimToplam+=ind*ara;
      }
    }

    /* Kategori ve marka kırılımı */
    var katKirilim=siparisKirilim(s,ay,function(p){return p.kategori;});
    Object.keys(katKirilim).forEach(function(k){ tabloSatiriTopla(kategoriTablo,k,katKirilim[k]); });
    var markaKirilim=siparisKirilim(s,ay,function(p){return p.marka;});
    Object.keys(markaKirilim).forEach(function(k){ tabloSatiriTopla(markaTablo,k,markaKirilim[k]); });
  });

  document.getElementById('panelCiro').textContent=fTR(ciro);
  document.getElementById('panelSiparisAdet').textContent=siparisAdet+' sipariş';
  document.getElementById('panelKasa').textContent=fTR(kasa);
  document.getElementById('panelKdv').textContent=fTR(kdv);
  document.getElementById('panelKom').textContent=fTR(kom);
  document.getElementById('panelNet').textContent=fTR(net);
  document.getElementById('panelAlacak').textContent=fTR(alacak);
  document.getElementById('panelAlacakAdet').textContent=alacakAdet+' sipariş';

  hedefKartiCiz(ay,kasa);
  document.getElementById('panelPersonelTablo').innerHTML=performansTablosu(personelTablo,'Personel','Sipariş');
  document.getElementById('panelKategoriTablo').innerHTML=performansTablosu(kategoriTablo,'Kategori','Adet');
  document.getElementById('panelMarkaTablo').innerHTML=performansTablosu(markaTablo,'Marka','Adet');
  yillikOzetCiz(yil,siparisler);
  gunlukGrafikCiz(gunluk);
}

function hedefKartiCiz(ay,gerceklesen){
  var kart=document.getElementById('hedefBody'); if(!kart)return;
  var h=(DATA.hedefler||{})[ay];
  var hedef=h?pTR(h.hedef):0;
  var duz=document.getElementById('hedefDuzenle');
  if(duz)duz.onclick=function(){ hedefModaliAc(ay); };
  if(!hedef){
    kart.innerHTML='<div class="mini-note">Bu ay için hedef belirlenmemiş.'+(finansMi()?' Sağ üstten ekleyebilirsin.':'')+'</div>';
    return;
  }
  var oran=Math.max(0,Math.min(100,Math.round(gerceklesen/hedef*100)));
  var bugun=new Date(), ayBasi=new Date(parseInt(ay.substring(0,4),10),parseInt(ay.substring(5,7),10)-1,1);
  var ayGun=new Date(ayBasi.getFullYear(),ayBasi.getMonth()+1,0).getDate();
  var buAy=(ay===buAyStr());
  var kalanGun=buAy?Math.max(0,ayGun-bugun.getDate()+1):0;
  var kalanTutar=Math.max(0,hedef-gerceklesen);
  kart.innerHTML='<div class="split-row" style="border:none;padding:0"><span class="split-name">Hedef</span><span class="split-val">'+fTR(hedef)+' ₺</span></div>'
    +'<div class="hedef-bar-wrap"><div class="hedef-bar'+(oran>=100?' ok':'')+'" style="width:'+oran+'%"></div></div>'
    +'<div class="split-row" style="border:none;padding:2px 0"><span class="split-name">Gerçekleşen</span><span class="split-val" style="color:'+(oran>=100?'var(--green)':'var(--black)')+'">'+fTR(gerceklesen)+' ₺ (%'+oran+')</span></div>'
    +(buAy?'<div class="split-row" style="border:none;padding:2px 0"><span class="split-name">Kalan '+kalanGun+' günde gereken</span><span class="split-val">'+fTR(kalanGun>0?kalanTutar/kalanGun:kalanTutar)+' ₺/gün</span></div>':'')
    +(h.notu?'<div class="mini-note">'+esc(h.notu)+'</div>':'');
}

/**
 * Yıllık özet. Eskiden 12 ay × tüm siparişler döngüsü çeviriyordu; artık
 * her sipariş bir kez taranıp ödemesi olan aylara dağıtılır. Sonuç veri
 * sürümü ve yıl bazında önbelleğe alınır, aynı tablo tekrar hesaplanmaz.
 */
var yillikOnbellek={surum:-1,yil:'',html:''};
function yillikOzetCiz(yil,siparisler){
  var hedef=document.getElementById('panelYillikTablo'); if(!hedef)return;
  if(yillikOnbellek.surum===DATA_SURUM&&yillikOnbellek.yil===yil){
    hedef.innerHTML=yillikOnbellek.html; return;
  }
  var aylik={};
  function ayNesnesi(ay){
    if(!aylik[ay])aylik[ay]={kasa:0,kdv:0,komisyon:0,net:0,siparis:0};
    return aylik[ay];
  }
  siparisler.forEach(function(s){
    var aylar={};
    (s.odemeler||[]).forEach(function(o){
      var t=String(o.tarih||'');
      if(t.substring(0,4)===yil)aylar[t.substring(0,7)]=true;
    });
    Object.keys(aylar).forEach(function(ay){
      var a=siparisNakitAkis(s,ay), v=ayNesnesi(ay);
      v.kasa+=a.kasa; v.kdv+=a.kdv; v.komisyon+=a.komisyon; v.net+=a.net;
    });
    var st=String(s.siparisTarihi||'');
    if(st.substring(0,4)===yil)ayNesnesi(st.substring(0,7)).siparis++;
  });

  var gövde='',t={kasa:0,kdv:0,komisyon:0,net:0,siparis:0};
  Object.keys(aylik).sort().forEach(function(ay){
    var v=aylik[ay];
    if(Math.abs(v.kasa)<=0.005&&!v.siparis)return;
    t.kasa+=v.kasa; t.kdv+=v.kdv; t.komisyon+=v.komisyon; t.net+=v.net; t.siparis+=v.siparis;
    gövde+='<tr><td style="font-weight:600">'+AYLAR[parseInt(ay.substring(5,7),10)-1]+'</td>'
      +'<td class="num">'+v.siparis+'</td><td class="num" style="color:var(--green)">'+fTR(v.kasa)+'</td>'
      +'<td class="num" style="color:var(--gray-600)">'+fTR(v.kdv)+'</td>'
      +'<td class="num" style="color:var(--gray-600)">'+fTR(v.komisyon)+'</td>'
      +'<td class="num" style="font-weight:700">'+fTR(v.net)+'</td></tr>';
  });
  if(!gövde)gövde='<tr><td colspan="6" style="text-align:center;color:var(--gray-400);padding:26px">Bu yıl için veri yok.</td></tr>';
  var html='<table class="tbl"><thead><tr><th>Ay</th><th class="num">Sipariş</th><th class="num">Kasa</th><th class="num">KDV</th><th class="num">Kom.+Prim</th><th class="num">Net</th></tr></thead>'
    +'<tbody>'+gövde+'</tbody><tfoot><tr><td>Toplam '+yil+'</td><td class="num">'+t.siparis+'</td>'
    +'<td class="num" style="color:var(--green)">'+fTR(t.kasa)+'</td><td class="num">'+fTR(t.kdv)+'</td>'
    +'<td class="num">'+fTR(t.komisyon)+'</td><td class="num">'+fTR(t.net)+'</td></tr></tfoot></table>';
  yillikOnbellek={surum:DATA_SURUM,yil:yil,html:html};
  hedef.innerHTML=html;
}

function gunlukGrafikCiz(gunluk){
  var cv=document.getElementById('panelChart'); if(!cv||typeof Chart==='undefined')return;
  var gunler=[],degerler=[];
  for(var i=1;i<=31;i++){ if(gunluk[i]){ gunler.push(i); degerler.push(Math.round(gunluk[i])); } }
  /* Grafiği yıkıp yeniden kurmak pahalı: varsa yerinde güncellenir. */
  if(panelChartInst){
    panelChartInst.data.labels=gunler;
    panelChartInst.data.datasets[0].data=degerler;
    panelChartInst.update();
    return;
  }
  /* Grafik markayla değil etkileşim rengiyle çizilir: marka rengi yalnızca
     logoda ve birincil düğmede kalsın diye. */
  var cizgi=tokenRenk('--secim','#18181B');
  Chart.defaults.font.family="'DM Sans',sans-serif";
  Chart.defaults.color=tokenRenk('--metin-silik','#8A95A8');
  panelChartInst=new Chart(cv,{type:'line',data:{labels:gunler,datasets:[{label:'Tahsilat (₺)',data:degerler,
    borderColor:cizgi,backgroundColor:'rgba('+tokenRenk('--secim-rgb','24,24,27')+',0.10)',
    borderWidth:3,fill:true,tension:0.4,pointBackgroundColor:cizgi}]},
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},
      scales:{y:{beginAtZero:true,grid:{color:tokenRenk('--cizgi','#E2E8F3')}},x:{grid:{display:false}}}}});
}

/* ═══════════ KASA ÖZET MODALI (bugün / bu ay) ═══════════ */
function kasaOzetModaliAc(tip){
  if(!magazaYonetimiMi()){ toast('Kasa özetini görme yetkiniz yok',false); return; }
  var deger=tip==='ay'?buAyStr():bugunStr();
  document.getElementById('kasaOzetBaslik').textContent=tip==='ay'?'Bu Ayın Kasası':'Bugünün Kasası';
  document.getElementById('kasaOzetAlt').textContent=tip==='ay'?deger:tarihGoster(deger);
  document.getElementById('kasaOzetBody').innerHTML='<div class="mini-note">Hesaplanıyor...</div>';
  modalAc('kasaOzetOverlay');
  gcall('kasaOzetGetir',[TOKEN,tip,deger],function(o){ kasaOzetCiz(o); },
    function(e){ document.getElementById('kasaOzetBody').innerHTML='<div class="mini-note">Yüklenemedi: '+esc((e&&e.message)||'')+'</div>'; });
}
function kasaOzetCiz(o){
  if(!o){ document.getElementById('kasaOzetBody').innerHTML='<div class="mini-note">Veri yok.</div>'; return; }
  var h='<div class="kasa-section-title">Satış (tahsil edilen)</div>'
    +'<div class="split-row"><span class="split-name">💵 Nakit satış</span><span class="split-val">'+fTR(o.satis.nakit)+' ₺</span></div>'
    +'<div class="split-row"><span class="split-name">💳 POS satış</span><span class="split-val">'+fTR(o.satis.pos)+' ₺</span></div>'
    +(o.satis.iade>0?'<div class="split-row"><span class="split-name">↩ İade</span><span class="split-val" style="color:var(--red)">-'+fTR(o.satis.iade)+' ₺</span></div>':'')
    +'<div class="split-row" style="border-top:2px dashed var(--gray-200);margin-top:4px;padding-top:10px"><span class="split-name" style="font-weight:700">Toplam satış</span><span class="split-val" style="font-size:16px">'+fTR(o.satis.toplam)+' ₺</span></div>';

  var kisiler=Object.keys(o.personel||{}).filter(function(k){return Math.abs(o.personel[k])>0.005;})
    .sort(function(a,b){return o.personel[b]-o.personel[a];});
  h+='<div class="kasa-section-title">Personel bazlı</div>';
  if(!kisiler.length)h+='<div class="mini-note">Bu dönemde tahsilat yok.</div>';
  else{
    var maks=o.personel[kisiler[0]]||1;
    kisiler.forEach(function(k){
      h+='<div style="margin-bottom:8px"><div class="split-row" style="border:none;padding:0 0 2px"><span class="split-name">'+esc(k)+'</span><span class="split-val">'+fTR(o.personel[k])+' ₺</span></div>'
        +'<div class="bar-wrap" style="margin-top:2px"><div class="bar" style="width:'+Math.max(0,Math.round(o.personel[k]/maks*100))+'%"></div></div></div>';
    });
  }

  h+='<div class="kasa-section-title">Mağaza masrafları</div>';
  if(!(o.masraflar||[]).length)h+='<div class="mini-note">Bu dönemde mağaza masrafı girilmemiş.</div>';
  else{
    (o.masraflar||[]).slice(0,12).forEach(function(m){
      h+='<div class="split-row"><span class="split-name">'+esc(m.kalem||m.ana)+(m.aciklama?' <span style="color:var(--gray-400);font-size:11px">'+esc(m.aciklama)+'</span>':'')+'</span>'
        +'<span class="split-val" style="color:var(--red)">-'+fTR(m.tutar)+' ₺</span></div>';
    });
    h+='<div class="split-row" style="border-top:2px dashed var(--gray-200);margin-top:4px;padding-top:10px"><span class="split-name" style="font-weight:700">Toplam masraf</span>'
      +'<span class="split-val" style="color:var(--red)">-'+fTR(o.masrafToplam)+' ₺</span></div>'
      +'<div class="split-row" style="border:none"><span class="split-name" style="font-size:12px;color:var(--gray-600)">Bunun nakit çıkışı</span><span class="split-val" style="font-size:12px">-'+fTR(o.masrafNakit)+' ₺</span></div>';
  }

  h+='<div class="kasa-net-box"><div class="kasa-net-label">Net nakit — '+(o.tip==='ay'?'bu ay kasada birikmesi':'bugün kasada kalması')+' gereken</div>'
    +'<div class="kasa-net-val">'+fTR(o.netNakit)+' ₺</div>'
    +'<div class="kasa-net-sub">Nakit satış '+fTR(o.satis.nakit)+' − nakit mağaza masrafı '+fTR(o.masrafNakit)+'</div></div>';
  document.getElementById('kasaOzetBody').innerHTML=h;
}

/* ═══════════ MASRAFLAR ═══════════ */
function masrafListesiCiz(){
  var el=document.getElementById('masrafListe'); if(!el)return;
  var arama=(document.getElementById('masrafArama').value||'').toLowerCase();
  var liste=(DATA.masraflar||[]).filter(function(m){
    if(!arama)return true;
    return String(m.kalem).toLowerCase().indexOf(arama)>-1||String(m.aciklama||'').toLowerCase().indexOf(arama)>-1;
  });
  if(!liste.length){ el.innerHTML='<div class="empty"><div class="ic">🧾</div><p>Masraf kaydı yok.</p></div>'; return; }
  el.innerHTML=liste.map(function(m){
    return '<div class="rec" style="cursor:default"><div class="rec-dot" style="background:var(--red)"></div>'
      +'<div class="rec-info"><div class="rec-cat">'+esc(m.kalem)+'</div>'
      +'<div class="rec-meta"><span>'+tarihGoster(m.tarih)+'</span><span>'+esc(m.hesap)+'</span>'
      +(m.aciklama?'<span>'+esc(m.aciklama)+'</span>':'')+(m.kaydeden?'<span>👤 '+esc(m.kaydeden)+'</span>':'')+'</div></div>'
      +'<div class="rec-amt" style="color:var(--red)">-'+fTR2(m.tutar)+'</div>'
      +'<div class="rec-actions"><button class="icon-btn" onclick="masrafSilTikla(\''+q(m.id)+'\')">🗑</button></div></div>';
  }).join('');
}
function masrafModaliAc(){
  document.getElementById('masrafTarih').value=bugunStr();
  document.getElementById('masrafTutar').value='';
  document.getElementById('masrafAciklama').value='';
  var kalemler=(DATA.ayar&&DATA.ayar.masrafKalemleri)||[];
  document.getElementById('masrafKalem').innerHTML=kalemler.map(function(k){return '<option value="'+esc(k)+'">'+esc(k)+'</option>';}).join('');
  var hesaplar=(DATA.ayar&&DATA.ayar.hesaplar)||['Nakit Kasa'];
  var nakit=(DATA.ayar&&DATA.ayar.nakitHesap)||'Nakit Kasa';
  document.getElementById('masrafHesap').innerHTML=hesaplar.map(function(x){
    return '<option value="'+esc(x)+'"'+(x===nakit?' selected':'')+'>'+esc(x)+'</option>';
  }).join('');
  modalAc('masrafOverlay');
}
function masrafKaydetTikla(){
  var masraf={
    tarih:document.getElementById('masrafTarih').value||bugunStr(),
    tutar:pTR(document.getElementById('masrafTutar').value),
    kalem:document.getElementById('masrafKalem').value,
    hesap:document.getElementById('masrafHesap').value,
    aciklama:document.getElementById('masrafAciklama').value.trim()
  };
  if(masraf.tutar<=0){ toast('Tutar girin',false); return; }
  personelSor('',function(personel){
    gcall('magazaMasrafEkle',[TOKEN,masraf,personel],function(r){
      modalKapat(null,'masrafOverlay'); toast('Masraf kaydedildi'); masrafYamala(r);
    },function(e){ toast('Kaydedilemedi: '+((e&&e.message)||''),false); });
  });
}
function masrafSilTikla(id){
  if(!confirm('Bu masraf kaydı silinsin mi?'))return;
  personelSor('',function(personel){
    gcall('magazaMasrafSil',[TOKEN,id,personel],function(){ toast('Silindi'); masrafYerelKaldir(id); },
      function(e){ toast('Silinemedi: '+((e&&e.message)||''),false); });
  });
}

/* ═══════════ İŞLETME · ABONELİK · ŞUBE ═══════════ */
function isletmeKartiCiz(){
  var k=document.getElementById('abonelikKart'); if(!k)return;
  var i=DATA.isletme||{};
  var durumEtiket={deneme:'Deneme',aktif:'Aktif',odeme_bekliyor:'Ödeme bekliyor',
    askida:'Askıda',iptal:'İptal'};
  var renk=i.yazabilir===false?'var(--red)':(i.durum==='aktif'?'var(--green)':'var(--black)');
  k.innerHTML=
    '<div><div class="ak-etiket">Plan</div><div class="ak-deger">'+esc(i.planAd||i.plan||'—')+'</div></div>'
    +'<div><div class="ak-etiket">Durum</div><div class="ak-deger" style="color:'+renk+'">'+esc(durumEtiket[i.durum]||i.durum||'—')+'</div></div>'
    +'<div><div class="ak-etiket">'+(i.durum==='deneme'?'Deneme bitişi':'Abonelik bitişi')+'</div>'
      +'<div class="ak-deger">'
      +(tarihGoster(i.durum==='deneme'?i.denemeBitis:i.abonelikBitis)||'—')+'</div></div>'
    +'<div><div class="ak-etiket">Kalan</div><div class="ak-deger">'+(parseInt(i.kalanGun,10)||0)+' gün</div></div>'
    +'<div><div class="ak-etiket">Kullanıcı</div><div class="ak-deger">'+(i.kullaniciSayisi||0)+' / '+(i.maxKullanici||0)+'</div></div>'
    +'<div><div class="ak-etiket">Şube</div><div class="ak-deger">'+(i.magazaSayisi||0)+' / '+(i.maxMagaza||0)+'</div></div>';

  var pe=document.getElementById('isletmePlanEtiket');
  if(pe)pe.textContent=(i.planAd||'')+(i.slug?' · '+i.slug:'');
  var alanlar={isletmeAd:'ad',isletmeTelefon:'telefon',isletmeEposta:'eposta'};
  Object.keys(alanlar).forEach(function(id){
    var e=document.getElementById(id); if(e&&!e.dataset.kirli)e.value=i[alanlar[id]]||'';
  });
}

function isletmeKaydetTikla(){
  var bilgi={
    ad:document.getElementById('isletmeAd').value.trim(),
    telefon:document.getElementById('isletmeTelefon').value.trim(),
    eposta:document.getElementById('isletmeEposta').value.trim(),
    vergiDairesi:document.getElementById('isletmeVergiDairesi').value.trim(),
    vergiNo:document.getElementById('isletmeVergiNo').value.trim(),
    adres:document.getElementById('isletmeAdres').value.trim()
  };
  if(!bilgi.ad){ toast('İşletme adı gerekli',false); return; }
  gcall('isletmeGuncelle',[TOKEN,bilgi],function(o){
    DATA.isletme=o||DATA.isletme; toast('Kaydedildi'); veriDegisti();
  },function(e){ toast('Kaydedilemedi: '+((e&&e.message)||''),false); });
}

function subeListesiCiz(){
  var el=document.getElementById('subeListe'); if(!el)return;
  var i=DATA.isletme||{};
  var le=document.getElementById('subeLimitEtiket');
  if(le)le.textContent=(i.magazaSayisi||0)+' / '+(i.maxMagaza||0)+' şube';
  el.innerHTML=(DATA.magazalar||[]).map(function(m){
    return '<div class="split-row"><span class="split-name">'+esc(m.ad)
      +' <span style="color:var(--gray-400);font-size:11px">'+esc(m.kod)+'</span></span>'
      +'<span class="split-val">'+(m.aktif?'Aktif':'Pasif')+'</span></div>';
  }).join('')||'<div class="mini-note">Şube yok.</div>';
}

function subeEkleTikla(){
  var ad=document.getElementById('yeniSubeAd').value.trim();
  var kod=document.getElementById('yeniSubeKod').value.trim();
  if(!ad||!kod){ toast('Şube adı ve kodu girin',false); return; }
  gcall('magazaEkle',[TOKEN,ad,kod],function(){
    document.getElementById('yeniSubeAd').value='';
    document.getElementById('yeniSubeKod').value='';
    toast('Şube eklendi'); verileriYukle(false);
  },function(e){ toast((e&&e.message)||'Eklenemedi',false); });
}

/** KVKK veri taşınabilirliği: tüm veriyi JSON olarak indirir. */
function verileriIndir(){
  toast('Veriler hazırlanıyor...');
  gcall('isletmeVerisiAktar',[],function(d){
    var ad=((DATA.isletme&&DATA.isletme.slug)||'kuzmos')+'-veri-'+bugunStr()+'.json';
    var b=new Blob([JSON.stringify(d,null,2)],{type:'application/json'});
    var a=document.createElement('a');
    a.href=URL.createObjectURL(b); a.download=ad; a.click();
    setTimeout(function(){ URL.revokeObjectURL(a.href); },2000);
    toast('İndirildi');
  },function(e){ toast('Alınamadı: '+((e&&e.message)||''),false); });
}

/* ═══════════ KDV ═══════════ */
function kdvKartiCiz(){
  var el=document.getElementById('kdvListe'); if(!el)return;
  var mod=document.getElementById('ayarKdvModu');
  if(mod&&!mod.dataset.kirli)mod.value=kdvDahilMi()?'dahil':'haric';
  var not=document.getElementById('kdvModuNot');
  if(not)not.textContent=kdvDahilMi()
    ? 'Ürün fiyatı KDV dahil girilir; rapor KDV\'yi fiyatın içinden ayırır.'
    : 'Ürün fiyatı KDV hariç girilir; KDV genel toplama eklenir.';
  el.innerHTML='<table class="oran-tablo"><thead><tr><th>Kategori</th><th>KDV (%)</th></tr></thead><tbody>'
    +(DATA.urunKategorileri||[]).map(function(k,i){
      return '<tr><td class="satir-ad">'+esc(k.ikon||'')+' '+esc(k.ad)+'</td>'
        +'<td><input type="text" inputmode="decimal" id="kdvOran'+i+'" value="'+esc(String(k.kdv))+'"></td></tr>';
    }).join('')+'</tbody></table>';
}

function kdvKaydetTikla(){
  var liste=(DATA.urunKategorileri||[]).map(function(k,i){
    var e=document.getElementById('kdvOran'+i);
    return { ad:k.ad, kdv:pTR(e?e.value:k.kdv), ikon:k.ikon, aktif:true };
  });
  var mod=document.getElementById('ayarKdvModu').value;
  gcall('urunKategorileriKaydet',[TOKEN,liste],function(){
    gcall('ayarGuncelle',[TOKEN,'kdv_modu',mod],function(){
      toast('KDV ayarları kaydedildi'); verileriYukle(false);
    },function(e){ toast('Kaydedilemedi: '+((e&&e.message)||''),false); });
  },function(e){ toast('Kaydedilemedi: '+((e&&e.message)||''),false); });
}

/* ═══════════ KREDİ KARTI KOMİSYONU ═══════════ */
/*
 * Banka × taksit matrisi. Tablo yeniden çizilirken (banka eklendiğinde)
 * ekranda yazılı ama henüz kaydedilmemiş oranların kaybolmaması için
 * değerler önce modele okunur.
 */
var komisyonSatirlari=null, komisyonDeger=null;

function komisyonTaksitleri(){ return (DATA.ayar&&DATA.ayar.taksitler)||[]; }

function komisyonModeliHazirla(){
  if(komisyonDeger)return;
  var matris=(DATA.ayar&&DATA.ayar.kkKomisyon)||{};
  komisyonDeger={};
  Object.keys(matris).forEach(function(b){ komisyonDeger[b]=Object.assign({},matris[b]); });
  if(!komisyonDeger[''])komisyonDeger['']={};
  komisyonSatirlari=Object.keys(komisyonDeger).sort(function(a,b){
    return a===''?-1:(b===''?1:a.localeCompare(b,'tr'));
  });
}

/** Ekrandaki değerleri modele alır (yeniden çizimden önce). */
function komisyonDomdanOku(){
  if(!komisyonSatirlari)return;
  var taksitler=komisyonTaksitleri();
  komisyonSatirlari.forEach(function(b,bi){
    komisyonDeger[b]=komisyonDeger[b]||{};
    taksitler.forEach(function(t,ti){
      var e=document.getElementById('kom_'+bi+'_'+ti);
      if(!e)return;
      if(e.value==='')delete komisyonDeger[b][t];
      else komisyonDeger[b][t]=pTR(e.value);
    });
  });
}

function komisyonKartiCiz(){
  var el=document.getElementById('komisyonTablo'); if(!el)return;
  komisyonModeliHazirla();
  var taksitler=komisyonTaksitleri();
  el.innerHTML='<table class="oran-tablo"><thead><tr><th>Banka</th>'
    +taksitler.map(function(t){ return '<th>'+esc(t)+'</th>'; }).join('')
    +'<th></th></tr></thead><tbody>'
    +komisyonSatirlari.map(function(b,bi){
      return '<tr><td class="satir-ad">'+(b===''?'Varsayılan':esc(b))+'</td>'
        +taksitler.map(function(t,ti){
          var v=(komisyonDeger[b]||{})[t];
          return '<td><input type="text" inputmode="decimal" id="kom_'+bi+'_'+ti+'" value="'
            +(v===undefined||v===null?'':esc(String(v)))+'" placeholder="—"></td>';
        }).join('')
        +'<td>'+(b===''?'':'<button class="icon-btn" onclick="komisyonBankaSil('+bi+')">🗑</button>')+'</td></tr>';
    }).join('')+'</tbody></table>';

  var sec=document.getElementById('komisyonYeniBanka');
  if(sec){
    var kalan=((DATA.ayar&&DATA.ayar.bankalar)||[]).filter(function(b){
      return komisyonSatirlari.indexOf(b)===-1;
    });
    sec.innerHTML=kalan.map(function(b){ return '<option value="'+esc(b)+'">'+esc(b)+'</option>'; }).join('')
      ||'<option value="">Tüm bankalar eklendi</option>';
  }
}

function komisyonBankaEkle(){
  var b=document.getElementById('komisyonYeniBanka').value;
  if(!b){ toast('Eklenecek banka yok',false); return; }
  komisyonDomdanOku();
  if(komisyonSatirlari.indexOf(b)>-1){ toast('Bu banka zaten listede',false); return; }
  komisyonDeger[b]={};
  komisyonSatirlari.push(b);
  komisyonKartiCiz();
}

function komisyonBankaSil(bi){
  komisyonDomdanOku();
  var b=komisyonSatirlari[bi];
  if(b==='')return;
  delete komisyonDeger[b];
  komisyonSatirlari.splice(bi,1);
  komisyonKartiCiz();
}

function komisyonKaydetTikla(){
  komisyonDomdanOku();
  var liste=[];
  komisyonSatirlari.forEach(function(b){
    Object.keys(komisyonDeger[b]||{}).forEach(function(t){
      liste.push({ banka:b, taksit:t, oran:komisyonDeger[b][t] });
    });
  });
  gcall('kkKomisyonKaydet',[TOKEN,liste],function(){
    komisyonSatirlari=null; komisyonDeger=null;
    toast('Komisyon oranları kaydedildi'); verileriYukle(false);
  },function(e){ toast('Kaydedilemedi: '+((e&&e.message)||''),false); });
}

function primKaydetTikla(){
  var v=document.getElementById('ayarPrimOran').value;
  gcall('ayarGuncelle',[TOKEN,'personel_prim',String(pTR(v))],function(){
    toast('Prim oranı kaydedildi'); verileriYukle(false);
  },function(e){ toast('Kaydedilemedi: '+((e&&e.message)||''),false); });
}

/* ═══════════ LOGO ═══════════ */
function logoKartiCiz(){
  var el=document.getElementById('logoOnizleme'); if(!el)return;
  var url=(DATA.ayar&&DATA.ayar.logoUrl)||'';
  el.innerHTML=url
    ? '<img src="'+esc(url)+'" alt="Logo">'
    : 'Logo yüklenmemiş';
}

function logoYukleTikla(){
  var g=document.getElementById('logoDosya');
  var dosya=g&&g.files&&g.files[0];
  if(!dosya){ toast('Dosya seçin',false); return; }
  toast('Logo yükleniyor...');
  gcall('logoYukle',[TOKEN,dosya],function(ayar){
    if(ayar)DATA.ayar=ayar;
    g.value='';
    toast('Logo kaydedildi');
    veriDegisti(); logoKartiCiz(); basliklariKur();
  },function(e){ toast('Yüklenemedi: '+((e&&e.message)||''),false); });
}

function logoKaldirTikla(){
  if(!confirm('Logo kaldırılsın mı?'))return;
  gcall('logoKaldir',[],function(ayar){
    if(ayar)DATA.ayar=ayar;
    toast('Logo kaldırıldı');
    veriDegisti(); logoKartiCiz(); basliklariKur();
  },function(e){ toast('Kaldırılamadı: '+((e&&e.message)||''),false); });
}

/* ═══════════ MÜŞTERİ MESAJI VE ERP ═══════════ */
function mesajAyarlariCiz(){
  var w=document.getElementById('ayarWaSablon'); if(!w)return;
  var a=DATA.ayar||{};
  if(!w.dataset.kirli)w.value=a.waSablon||'';
  var ea=document.getElementById('ayarErpAktif');
  if(ea)ea.value=a.erpAktif?'evet':'hayir';
  var ee=document.getElementById('ayarErpEtiket');
  if(ee&&!ee.dataset.kirli)ee.value=a.erpEtiket||'';
}

function mesajAyarKaydetTikla(){
  var islemler=[
    ['wa_sablon',document.getElementById('ayarWaSablon').value.trim()],
    ['erp_aktif',document.getElementById('ayarErpAktif').value],
    ['erp_etiket',document.getElementById('ayarErpEtiket').value.trim()]
  ];
  var kalan=islemler.length, hata=0;
  islemler.forEach(function(x){
    gcall('ayarGuncelle',[TOKEN,x[0],x[1]],function(){
      if(--kalan===0)bitti();
    },function(){ hata++; if(--kalan===0)bitti(); });
  });
  function bitti(){
    if(hata)toast('Bazı ayarlar kaydedilemedi',false);
    else { toast('Kaydedildi'); verileriYukle(false); }
  }
}

/* ═══════════ HEDEF ═══════════ */
function hedefModaliAc(ay){
  if(!finansMi()){ toast('Hedefi yönetici veya finans belirler',false); return; }
  var a=ay||donemAy();
  document.getElementById('hedefAy').value=a;
  var h=(DATA.hedefler||{})[a];
  document.getElementById('hedefTutar').value=h?fTR2(h.hedef):'';
  document.getElementById('hedefNot').value=h?(h.notu||''):'';
  modalAc('hedefOverlay');
}
function hedefKaydetTikla(){
  var ay=document.getElementById('hedefAy').value;
  if(!/^\d{4}-\d{2}$/.test(ay)){ toast('Ay seçin',false); return; }
  var tutar=pTR(document.getElementById('hedefTutar').value);
  var notu=document.getElementById('hedefNot').value.trim();
  gcall('hedefKaydet',[TOKEN,ay,tutar,notu],
    function(){ modalKapat(null,'hedefOverlay'); toast('Hedef kaydedildi'); hedefYamala(ay,tutar,notu); },
    function(e){ toast('Kaydedilemedi: '+((e&&e.message)||''),false); });
}

/* ═══════════ AYARLAR ═══════════ */
function ayarlarCiz(){
  if(!document.getElementById('hesabimAd'))return;
  var r=rol();
  if(KULLANICI){
    document.getElementById('hesabimAd').textContent=KULLANICI.ad||'—';
    document.getElementById('hesabimEmail').textContent=KULLANICI.email||'—';
    document.getElementById('hesabimRol').textContent=ROL_ETIKET[r]||r;
  }
  ['cardPersonel','cardMarka','cardHedefAyar','cardTekrar','cardOranlar','cardMesaj',
   'cardKdv','cardKomisyon'].forEach(function(id){
    var e=document.getElementById(id); if(e)e.style.display=finansMi()?'':'none';
  });
  /* İşletme, şube ve kullanıcı yönetimi: sahip + yönetici */
  ['cardKullanicilar','cardIsletme','cardSubeler','cardLogo'].forEach(function(id){
    var e=document.getElementById(id); if(e)e.style.display=yoneticiMi()?'':'none';
  });
  if(yoneticiMi()){ isletmeKartiCiz(); subeListesiCiz(); logoKartiCiz(); kullanicilariYukle(); }
  if(finansMi()){ mesajAyarlariCiz(); kdvKartiCiz(); komisyonKartiCiz(); }
  if(!finansMi())return;

  /* Personel */
  var primVars=pTR((DATA.ayar&&DATA.ayar.personelPrim)||0);
  var po=document.getElementById('ayarPrimOran');
  if(po&&!po.dataset.kirli)po.value=primVars?fTR2(primVars):'';
  document.getElementById('personelListe').innerHTML=(DATA.personel||[]).map(function(p,i){
    var oranEtiket=p.primMuaf
      ? ' <span style="color:var(--gray-400);font-size:11px">prim muaf</span>'
      : ' <span style="color:var(--gray-400);font-size:11px">prim %'
        +fTR2(personelPrimOrani(p.ad))+(p.primOrani===null||p.primOrani===undefined||p.primOrani===''?' (varsayılan)':'')+'</span>';
    return '<div class="split-row"><span class="split-name">'+esc(p.ad)+oranEtiket+(p.aktif===false?' <span style="color:var(--red);font-size:11px">pasif</span>':'')+'</span>'
      +'<span style="display:flex;gap:6px"><button class="icon-btn" title="Prim oranı" onclick="personelPrimOraniDegistir('+i+')">💰</button>'
      +'<button class="icon-btn" title="Prim muafiyeti" onclick="personelPrimDegistir('+i+')">🚫</button>'
      +'<button class="icon-btn" title="Aktif/pasif" onclick="personelAktifDegistir('+i+')">'+(p.aktif===false?'✅':'⛔')+'</button>'
      +'<button class="icon-btn" onclick="personelSilTikla('+i+')">🗑</button></span></div>';
  }).join('')||'<div class="mini-note">Personel eklenmemiş.</div>';

  /* Markalar */
  var mk=DATA.markalar||{};
  document.getElementById('markaListe').innerHTML=Object.keys(mk).sort().map(function(kat){
    return '<div style="margin-bottom:10px"><div style="font-size:11px;font-weight:700;color:var(--gray-600);text-transform:uppercase;margin-bottom:4px">'+esc(kat)+'</div>'
      +'<div class="chip-row">'+mk[kat].map(function(m){
        return '<span class="chip" onclick="markaSilTikla(\''+q(kat)+'\',\''+q(m)+'\')">'+esc(m)+' ✕</span>';
      }).join('')+'</div></div>';
  }).join('')||'<div class="mini-note">Marka yok.</div>';
  document.getElementById('yeniMarkaKategori').innerHTML=(DATA.urunKategorileri||[]).map(function(k){
    return '<option value="'+esc(k.ad)+'">'+esc(k.ad)+'</option>';
  }).join('');

  /* Hedefler */
  var hd=DATA.hedefler||{};
  document.getElementById('hedefListe').innerHTML=Object.keys(hd).sort().reverse().slice(0,12).map(function(ay){
    return '<div class="split-row"><span class="split-name">'+ay+'</span><span class="split-val">'+fTR(hd[ay].hedef)+' ₺ '
      +'<button class="icon-btn" style="display:inline-flex;margin-left:6px" onclick="hedefModaliAc(\''+q(ay)+'\')">✏️</button></span></div>';
  }).join('')||'<div class="mini-note">Hedef belirlenmemiş.</div>';

  /* Tekrarlayan ödemeler */
  document.getElementById('tekrarListe').innerHTML=(DATA.tekrar||[]).map(function(t,i){
    return '<div class="split-row"><span class="split-name">'+esc(t.ad)+' <span style="color:var(--gray-400);font-size:11px">her ayın '+t.gun+'\'i · '+esc(t.alt||t.ana)+'</span></span>'
      +'<span style="display:flex;align-items:center;gap:8px"><span class="split-val">'+fTR(t.tutar)+' ₺</span>'
      +'<button class="icon-btn" onclick="tekrarSilTikla('+i+')">🗑</button></span></div>';
  }).join('')||'<div class="mini-note">Tekrarlayan ödeme yok.</div>';

  /* Oranlar */
  var a=DATA.ayar||{};
  var komisyon=Object.keys(a.kkKomisyon||{}).map(function(k){return k+': %'+a.kkKomisyon[k];}).join(' · ');
  document.getElementById('oranBody').innerHTML=
    '<div class="split-row"><span class="split-name">Personel primi</span><span class="split-val">%'+(a.personelPrim||0)+'</span></div>'
    +'<div class="split-row"><span class="split-name">Nakit hesabı</span><span class="split-val">'+esc(a.nakitHesap||'')+'</span></div>'
    +'<div class="split-row"><span class="split-name">Kasa entegrasyonu</span><span class="split-val">'+(a.kasaEntegrasyon?'Açık':'Kapalı')+'</span></div>'
    +'<div style="margin-top:10px"><div style="font-size:11px;font-weight:700;color:var(--gray-600);text-transform:uppercase">KK komisyon oranları</div>'
    +'<div class="mini-note">'+esc(komisyon||'—')+'</div></div>'
    +'<div style="margin-top:8px"><div style="font-size:11px;font-weight:700;color:var(--gray-600);text-transform:uppercase">Masraf kalemleri</div>'
    +'<div class="mini-note">'+esc((a.masrafKalemleri||[]).join(', ')||'—')+'</div></div>'
    +'<div class="mini-note" style="margin-top:10px">Bu değerler Sheets\'teki <b>Ayarlar</b> sayfasından düzenlenir.</div>';

}
function personelListesiKaydet(liste){
  gcall('personelKaydet',[TOKEN,liste],function(){ toast('Personel listesi güncellendi'); verileriYukle(false); },
    function(e){ toast('Kaydedilemedi: '+((e&&e.message)||''),false); });
}
function personelEkleTikla(){
  var ad=document.getElementById('yeniPersonelAd').value.trim();
  if(!ad){ toast('Ad girin',false); return; }
  var liste=(DATA.personel||[]).slice();
  liste.push({ad:ad,aktif:true,primMuaf:false,notu:''});
  document.getElementById('yeniPersonelAd').value='';
  personelListesiKaydet(liste);
}
function personelAktifDegistir(i){
  var liste=(DATA.personel||[]).slice();
  liste[i]=Object.assign({},liste[i],{aktif:liste[i].aktif===false});
  personelListesiKaydet(liste);
}
function personelPrimDegistir(i){
  var liste=(DATA.personel||[]).slice();
  liste[i]=Object.assign({},liste[i],{primMuaf:!liste[i].primMuaf});
  personelListesiKaydet(liste);
}

/** Kişiye özel prim oranı; boş bırakılırsa işletme varsayılanı kullanılır. */
function personelPrimOraniDegistir(i){
  var liste=(DATA.personel||[]).slice();
  var p=liste[i];
  var mevcut=(p.primOrani===null||p.primOrani===undefined||p.primOrani==='')?'':String(p.primOrani);
  var yeni=prompt(p.ad+' için prim oranı (%) — boş bırakırsan varsayılan ('
    +fTR2(pTR((DATA.ayar&&DATA.ayar.personelPrim)||0))+') kullanılır:', mevcut);
  if(yeni===null)return;
  liste[i]=Object.assign({},p,{
    primOrani: String(yeni).trim()===''?'':pTR(yeni),
    primMuaf:false
  });
  personelListesiKaydet(liste);
}
function personelSilTikla(i){
  if(!confirm('Bu personel listeden çıkarılsın mı? (geçmiş kayıtlar etkilenmez)'))return;
  var liste=(DATA.personel||[]).slice();
  liste.splice(i,1);
  personelListesiKaydet(liste);
}
function markaEkleTikla(){
  var kat=document.getElementById('yeniMarkaKategori').value;
  var marka=document.getElementById('yeniMarkaAd').value.trim();
  if(!kat||!marka){ toast('Kategori ve marka girin',false); return; }
  gcall('markaEkle',[TOKEN,kat,marka],function(){ document.getElementById('yeniMarkaAd').value=''; toast('Marka eklendi'); verileriYukle(false); },
    function(e){ toast('Eklenemedi: '+((e&&e.message)||''),false); });
}
function markaSilTikla(kat,marka){
  if(!confirm('"'+marka+'" markası listeden çıkarılsın mı?'))return;
  gcall('markaSil',[TOKEN,kat,marka],function(){ toast('Silindi'); verileriYukle(false); },
    function(e){ toast('Silinemedi: '+((e&&e.message)||''),false); });
}

/* Kullanıcı yönetimi */
function kullanicilariYukle(){
  gcall('kullaniciListele',[TOKEN],function(liste){
    document.getElementById('kullaniciListe').innerHTML=(liste||[]).map(function(u){
      return '<div class="split-row"><span class="split-name">'+esc(u.ad)+' <span style="color:var(--gray-400);font-size:11px">'+esc(u.email)+' · '+(ROL_ETIKET[u.rol]||u.rol)+(u.aktif?'':' · Pasif')+'</span></span>'
        +'<span style="display:flex;gap:6px">'
        +'<button class="icon-btn" title="Şifre sıfırla" onclick="sifreSifirla(\''+q(u.email)+'\')">🔑</button>'
        +'<button class="icon-btn" title="'+(u.aktif?'Pasif yap':'Aktif yap')+'" onclick="kullaniciDurum(\''+q(u.email)+'\','+(!u.aktif)+')">'+(u.aktif?'⛔':'✅')+'</button>'
        +'</span></div>';
    }).join('')||'<div class="mini-note">Kullanıcı yok.</div>';
  },function(){});
}
function kullaniciModaliAc(){
  ['kAd','kEmail','kSifre'].forEach(function(id){document.getElementById(id).value='';});
  document.getElementById('kRol').value='magaza';
  modalAc('kullaniciOverlay');
}
function kullaniciKaydetTikla(){
  var u={ad:document.getElementById('kAd').value.trim(),email:document.getElementById('kEmail').value.trim(),
    sifre:document.getElementById('kSifre').value,rol:document.getElementById('kRol').value};
  if(!u.ad||!u.email||!u.sifre){ toast('Tüm alanları doldurun',false); return; }
  gcall('kullaniciEkleApi',[TOKEN,u],function(){ modalKapat(null,'kullaniciOverlay'); toast('Kullanıcı eklendi'); kullanicilariYukle(); },
    function(e){ toast('Eklenemedi: '+((e&&e.message)||''),false); });
}
function kullaniciDurum(email,aktif){
  gcall('kullaniciDurumDegistir',[TOKEN,email,aktif],function(){ toast(aktif?'Aktif edildi':'Pasif edildi'); kullanicilariYukle(); },
    function(e){ toast('İşlem başarısız: '+((e&&e.message)||''),false); });
}
function sifreSifirla(email){
  /* Başka bir kullanıcının şifresi doğrudan değiştirilemez: bunun için
     gizli service_role anahtarı gerekir ve o anahtar tarayıcıya konmaz.
     Yerine kullanıcıya sıfırlama bağlantısı gönderilir. */
  if(!confirm(email+' adresine şifre sıfırlama bağlantısı gönderilsin mi?'))return;
  gcall('kullaniciSifreSifirlamaGonder',[TOKEN,email],function(){ toast('Sıfırlama bağlantısı gönderildi'); },
    function(e){ toast('Gönderilemedi: '+((e&&e.message)||''),false); });
}
function sifreModaliAc(){
  document.getElementById('sifreYeni').value=''; document.getElementById('sifreTekrar').value='';
  modalAc('sifreOverlay');
}
function sifreKaydetTikla(){
  var a=document.getElementById('sifreYeni').value, b=document.getElementById('sifreTekrar').value;
  if(a.length<8){ toast('Şifre en az 8 karakter olmalı',false); return; }
  if(a!==b){ toast('Şifreler eşleşmiyor',false); return; }
  gcall('kullaniciSifreDegistir',[TOKEN,a],function(){ modalKapat(null,'sifreOverlay'); toast('Şifre güncellendi'); },
    function(e){ toast('Güncellenemedi: '+((e&&e.message)||''),false); });
}
