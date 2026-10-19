/* ═══════════ ORTAK DURUM ═══════════ */
var TOKEN=null, KULLANICI=null;
var DATA={isletme:{},magazalar:[],ayar:{},personel:[],urunKategorileri:[],markalar:{},siparis:[],musteriler:[],hedefler:{},masraflar:[],hareketler:[],cari:[],banka:[],tekrar:[],kasaKategorileri:[]};
var donemOfset=0, gunleriGoster=false, kayitLimit=100;
/* Her veri değişiminde artar; ağır hesapların önbelleğini geçersiz kılar. */
var DATA_SURUM=0;
var AYLAR=['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık'];
var ROL_ETIKET={yonetici:'Yönetici',finans:'Finans',magaza_muduru:'Mağaza Müdürü',personel:'Personel'};
var DURUMLAR=['Satış Yapıldı','Cam Siparişi Verildi','Montaj Yapıldı','Teslim Edildi'];
var DURUM_KISA=['Satış','Cam Sip.','Montaj','Teslim'];
var DURUM_RENK=['var(--bilgi)','var(--uyari)','var(--basarili)','var(--basarili)'];
/* Renkler app.css'teki tema token'larından okunur; palet değişince grafikler de döner. */
function tokenRenk(ad,yedek){
  try{ var v=getComputedStyle(document.documentElement).getPropertyValue(ad).trim(); return v||yedek; }
  catch(e){ return yedek; }
}
var GECIKME_LIMIT={'Satış Yapıldı':1,'Cam Siparişi Verildi':7,'Montaj Yapıldı':1};

/*
 * Rol bazlı sekmeler: [viewId, etiket, roller]
 *   yonetici      — her şey + kullanıcı/şube/işletme yönetimi
 *   finans        — kasa, rapor, cari, banka (kullanıcı yönetmez)
 *   magaza_muduru — kendi şubesi + şube kasası özeti ve paneli
 *   personel      — kendi şubesi: sipariş, tahsilat, müşteri, masraf
 */
var TUM_ROLLER=['yonetici','finans','magaza_muduru','personel'];
var SUBE_YONETIM=['yonetici','finans','magaza_muduru'];
var FINANS_ROLLER=['yonetici','finans'];
var NAVS=[
  ['viewSiparis','Sipariş',TUM_ROLLER],
  ['viewRecords','Kayıtlar',TUM_ROLLER],
  ['viewCustomers','Müşteriler',TUM_ROLLER],
  ['viewPipeline','Pipeline',TUM_ROLLER],
  ['viewPanel','Panel',SUBE_YONETIM],
  ['viewMasraf','Masraf',TUM_ROLLER],
  ['viewOzet','Kasa',FINANS_ROLLER],
  ['viewRapor','Rapor',FINANS_ROLLER],
  ['viewHareket','Hareketler',FINANS_ROLLER],
  ['viewCari','Planlanan',FINANS_ROLLER],
  ['viewBanka','Banka',FINANS_ROLLER],
  ['viewYillik','Yıllık',FINANS_ROLLER],
  ['viewAyar','Ayarlar',TUM_ROLLER]
];

function rol(){ return KULLANICI?KULLANICI.rol:'personel'; }
/** İşletme kasasının tamamı ve raporlar. */
function finansMi(){ var r=rol(); return r==='yonetici'||r==='finans'; }
/** Kullanıcı, şube, işletme bilgisi ve abonelik. */
function yoneticiMi(){ return rol()==='yonetici'; }
/** Şube kasası özeti, hedef ve panel. */
function magazaYonetimiMi(){ return SUBE_YONETIM.indexOf(rol())>-1; }
/** Yalnızca kendi şubesinde çalışan roller. */
function subeRoluMu(){ var r=rol(); return r==='magaza_muduru'||r==='personel'; }

/* ═══════════ PARA / TARİH ═══════════ */
function pTR(s){ if(s==null||s==='')return 0; if(typeof s==='number')return s;
  var t=String(s).trim().replace(/[^0-9.,-]/g,'');
  if(t.indexOf(',')>-1){ t=t.replace(/\./g,'').replace(',','.'); }
  else { var p=t.split('.');
    if(p.length>2)t=p.join('');
    else if(p.length===2&&p[1].length===3)t=p.join(''); }
  var n=parseFloat(t); return isNaN(n)?0:n; }
function fTR(n){ if(typeof n!=='number')n=pTR(n); if(!isFinite(n))n=0; return Math.round(n).toLocaleString('tr-TR'); }
function fTR2(n){ if(typeof n!=='number')n=pTR(n); if(!isFinite(n))n=0;
  return Math.abs(n-Math.round(n))<0.005?Math.round(n).toLocaleString('tr-TR')
    :n.toLocaleString('tr-TR',{minimumFractionDigits:2,maximumFractionDigits:2}); }
function paraFormatla(el){ var raw=String(el.value).replace(/[^0-9.,]/g,''); var ci=raw.indexOf(',');
  if(ci>-1){ var ip=raw.substring(0,ci).replace(/\./g,'')||'0', dp=raw.substring(ci+1).replace(/[.,]/g,'').substring(0,2);
    el.value=(parseInt(ip,10)||0).toLocaleString('tr-TR')+','+dp;
  } else { var d=raw.replace(/\./g,''); el.value=d===''?'':(parseInt(d,10)||0).toLocaleString('tr-TR'); } }
function bugunStr(){ var d=new Date(); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
function buAyStr(){ return bugunStr().substring(0,7); }
function tarihGoster(s){ if(!s)return ''; var p=String(s).split('-'); return p.length===3?p[2]+'.'+p[1]+'.'+p[0]:s; }
function esc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function q(s){ return String(s==null?'':s).replace(/\\/g,'\\\\').replace(/'/g,"\\'"); }
function toast(m,ok){ var t=document.getElementById('toast'); t.textContent=m;
  t.className='toast show'+(ok!==false?' ok':''); setTimeout(function(){t.className='toast';},2600); }

/* ═══════════ DÖNEM ═══════════ */
function donemAy(){ var d=new Date(); d.setDate(1); d.setMonth(d.getMonth()+donemOfset);
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0'); }
function donemYil(){ return donemAy().substring(0,4); }
function donemKaydir(x){ donemOfset+=x; hepsiniCiz(); }
function donemSifirla(){ donemOfset=0; hepsiniCiz(); }
function donemEtiketleriGuncelle(){
  var ms=donemAy(), lbl=AYLAR[parseInt(ms.split('-')[1],10)-1]+' '+ms.substring(0,4);
  ['panelDonem','ozetDonem','raporDonem','cariDonem'].forEach(function(id){var e=document.getElementById(id);if(e)e.textContent=lbl;});
  ['panelIleri','ozetIleri','raporIleri','cariIleri'].forEach(function(id){var e=document.getElementById(id);if(e)e.disabled=donemOfset>=0;});
  ['panelBugun','ozetBugun'].forEach(function(id){var e=document.getElementById(id);if(e)e.disabled=donemOfset===0;});
  ['panelAy1','panelAy2','panelAy3','panelAy4'].forEach(function(id){var e=document.getElementById(id);if(e)e.textContent=lbl;});
  var y=document.getElementById('panelYil'); if(y)y.textContent=donemYil();
  var y2=document.getElementById('yilLabel'); if(y2)y2.textContent=donemYil();
}

/* Sunucu çağrısı (gcall) js/api.js içinde tanımlıdır. */

/* ═══════════ KAYIT / KURULUM ═══════════ */
function kayitOl(){
  var e=document.getElementById('kayitErr');
  var bilgi={
    isletmeAd:document.getElementById('kayitIsletme').value.trim(),
    adSoyad:document.getElementById('kayitAd').value.trim(),
    eposta:document.getElementById('kayitEposta').value.trim(),
    telefon:document.getElementById('kayitTelefon').value.trim(),
    sifre:document.getElementById('kayitSifre').value
  };
  if(!bilgi.isletmeAd){ e.textContent='İşletme adını girin'; return; }
  if(!bilgi.eposta||!bilgi.sifre){ e.textContent='E-posta ve şifre girin'; return; }
  if(bilgi.sifre.length<8){ e.textContent='Şifre en az 8 karakter olmalı'; return; }
  e.textContent='İşletmeniz kuruluyor...';
  gcall('kayitOl',[bilgi],function(r){
    if(r&&r.onayBekliyor){
      e.textContent='E-posta adresinize onay bağlantısı gönderildi. Onayladıktan sonra giriş yapın.';
      return;
    }
    e.textContent='';
    TOKEN='sb';
    verileriYukle();
  },function(err){ e.textContent=(err&&err.message)||'Kayıt başarısız'; });
}

/* Hesabı olup işletmesi olmayan kullanıcı (davet/kayıt yarım kalmış) */
function isletmeKur(){
  var e=document.getElementById('kurulumErr');
  var ad=document.getElementById('kurulumIsletme').value.trim();
  if(!ad){ e.textContent='İşletme adını girin'; return; }
  e.textContent='Kuruluyor...';
  gcall('isletmeOlustur',[TOKEN,ad,document.getElementById('kurulumAd').value.trim(),
    document.getElementById('kurulumKod').value.trim(),''],
    function(){ e.textContent=''; verileriYukle(); },
    function(err){ e.textContent=(err&&err.message)||'Kurulamadı'; });
}

/* ═══════════ GİRİŞ ═══════════ */
function doLogin(){
  var email=document.getElementById('loginEmail').value.trim();
  var p=document.getElementById('loginPass').value;
  if(!email||!p){document.getElementById('loginErr').textContent='E-posta ve şifre girin';return;}
  document.getElementById('loginErr').textContent='Kontrol ediliyor...';
  gcall('girisYap',[email,p],function(r){
    if(!r||!r.ok){document.getElementById('loginErr').textContent=(r&&r.hata)||'Giriş başarısız';return;}
    TOKEN=r.token; KULLANICI={email:r.email,ad:'',rol:''};
    try{sessionStorage.setItem('kz_tok',TOKEN);}catch(e){}
    document.getElementById('loginErr').textContent='';
    document.getElementById('loginPass').value='';
    verileriYukle();
  },function(){document.getElementById('loginErr').textContent='Sunucuya ulaşılamadı';});
}
function cikisYap(){
  TOKEN=null; KULLANICI=null;
  DATA.isletme={};
  try{sessionStorage.removeItem('kz_tok');}catch(e){}
  gcall('cikis',[],null,null);
  abonelikBandiGuncelle();
  goster('viewLogin',true);
}

function verileriYukle(ilk){
  toast('Veriler yükleniyor...');
  gcall('tumVeriGetir',[TOKEN],function(d){
    if(!d)return;
    DATA=d; KULLANICI=d.kullanici||KULLANICI;
    DATA_SURUM++;
    basliklariKur(); hepsiniCiz(); kuyrukRozetiGuncelle(); abonelikBandiGuncelle();
    /* İlk açılış: yeni kurulan işletmede (hiç sipariş yok) kasa özeti yerine
       sipariş ekranı açılır — ilk iş sipariş girmektir. */
    if(ilk!==false){
      var ilkKurulum=!(DATA.siparis||[]).length;
      goster((subeRoluMu()||ilkKurulum)?'viewSiparis':'viewOzet',true);
    }
    /* Form sadece hiç kurulmamışsa hazırlanır; doldurulmuş form asla silinmez. */
    if(!formKirli&&!formUrunler.length) siparisFormTemizle(false);
    else { personelSecenekleriniCiz(document.getElementById('spPersonel').value); urunleriCiz(); }
  },function(e){
    var m=String(e&&e.message||'');
    /* Hesap var ama işletme yok: kurulum ekranına götür */
    if(m==='ISLETME_YOK'){ goster('viewKurulum',true); return; }
    if(m.indexOf('Oturum')>-1){ cikisYap(); return; }
    toast('Yüklenemedi, tekrar deneyin',false);
  });
}

/* ═══════════ ABONELİK BANDI ═══════════ */
/**
 * Deneme süresi ve abonelik durumu her ekranın altında görünür.
 * Süresi dolduğunda uygulama salt okunur olur; bunu kullanıcıdan
 * saklamıyoruz, kasa kaydı giremeyeceğini önceden bilmesi gerekir.
 */
function abonelikBandiGuncelle(){
  var b=document.getElementById('abonelikBant'); if(!b)return;
  var i=DATA.isletme||{};
  if(!i.durum){ b.className='abonelik-bant'; return; }
  var kalan=parseInt(i.kalanGun,10)||0;
  var metin='', uyari=false;
  if(!i.yazabilir){
    metin='⚠️ Aboneliğiniz sona erdi — uygulama salt okunur. Veriniz duruyor; planı yenileyince kayıt girişi açılır.';
    uyari=true;
  } else if(i.durum==='deneme'){
    metin='Deneme sürümü · '+kalan+' gün kaldı'+(kalan<=3?' — planı seçmek için dokunun':'');
    uyari=kalan<=3;
  } else if(i.durum==='odeme_bekliyor'){
    metin='Ödemeniz bekleniyor — kesinti olmadan devam etmek için planınızı yenileyin.';
    uyari=true;
  }
  b.textContent=metin;
  b.className='abonelik-bant'+(metin?' show':'')+(uyari?' uyari':'');
}

function yazmaIzni(){ return !DATA.isletme||DATA.isletme.yazabilir!==false; }

/* ═══════════ NAVİGASYON ═══════════ */
function basliklariKur(){
  var r=rol();
  /* Yazdırma başlığı ve ERP alanı işletmeye göre ayarlanır */
  var pf=document.getElementById('printFirma');
  if(pf)pf.textContent=(DATA.isletme&&DATA.isletme.ad)||'';
  var pl=document.getElementById('printLogo');
  if(pl){
    var logo=(DATA.ayar&&DATA.ayar.logoUrl)||'';
    if(logo)pl.setAttribute('src',logo); else pl.removeAttribute('src');
  }
  if(typeof erpAlaniKur==='function')erpAlaniKur();
  var gorunur=NAVS.filter(function(n){ return n[2].indexOf(r)>-1; });
  document.querySelectorAll('.header[data-baslik]').forEach(function(h){
    var view=h.parentElement.id;
    var nav='';
    gorunur.forEach(function(n){
      nav+='<button class="btn btn-hdr btn-sm'+(n[0]===view?' on':'')+'" onclick="goster(\''+n[0]+'\')">'+n[1]+'</button>';
    });
    h.innerHTML='<div><div class="brand">Kuz<span>mos</span></div><div class="tagline">'+esc(h.getAttribute('data-baslik'))+'</div></div>'
      +'<div class="header-actions">'
      +'<div class="stat-box" onclick="kasaOzetModaliAc(\'gun\')"><div class="stat-label">Bugün (Kasa)</div><div class="stat-val-hdr" id="hdrBugun_'+view+'">0 ₺</div></div>'
      +'<div class="stat-box" onclick="kasaOzetModaliAc(\'ay\')"><div class="stat-label">Bu Ay (Kasa)</div><div class="stat-val-hdr" id="hdrAy_'+view+'">0 ₺</div></div>'
      +nav
      +'<button class="btn btn-yellow btn-sm" onclick="yeniSiparis()">＋ Yeni</button>'
      +'</div>';
  });
  kasaRozetleriGuncelle();
}

/* ═══════════ TEMBEL ÇİZİM ═══════════
   Her ekran ancak (a) görünürken ve (b) verisi değiştiyse yeniden çizilir.
   Eskiden her yenilemede 13 ekran birden çiziliyordu; panel ve yıllık özet
   gibi ağır hesaplar ekran kapalıyken de çalışıyordu. */
var EKRAN_CIZ={
  viewRecords:function(){kayitListesiCiz();},
  viewCustomers:function(){musteriListesiCiz();},
  viewPipeline:function(){pipelineCiz();},
  viewTrash:function(){copListesiCiz();},
  viewPanel:function(){panelCiz();},
  viewMasraf:function(){masrafListesiCiz();},
  viewOzet:function(){ozetCiz();},
  viewRapor:function(){raporCiz();},
  viewHareket:function(){hareketListesiCiz();},
  viewCari:function(){cariCiz();},
  viewBanka:function(){bankaCiz();},
  viewYillik:function(){yillikCiz();},
  viewAyar:function(){ayarlarCiz();}
};
var ekranKirli={};

function aktifEkran(){ var el=document.querySelector('.view.active'); return el?el.id:''; }
function ekranYetkiliMi(v){
  var nav=null; NAVS.forEach(function(n){ if(n[0]===v)nav=n; });
  return !nav||nav[2].indexOf(rol())>-1;
}
function ekranCiz(v){
  var f=EKRAN_CIZ[v];
  if(!f||!ekranKirli[v]||!ekranYetkiliMi(v))return;
  ekranKirli[v]=false;
  f();
}
function aktifEkraniCiz(){ ekranCiz(aktifEkran()); }

/** Veri değişti: tüm ekranlar bayat, görünen ekran hemen çizilir. */
function ekranlariKirlet(){
  Object.keys(EKRAN_CIZ).forEach(function(k){ ekranKirli[k]=true; });
  donemEtiketleriGuncelle();
  kasaRozetleriGuncelle();
  abonelikBandiGuncelle();
  aktifEkraniCiz();
}

function goster(v,zorla){
  var r=rol();
  var nav=null; NAVS.forEach(function(n){ if(n[0]===v)nav=n; });
  if(!zorla&&nav&&nav[2].indexOf(r)===-1)return;
  if(!zorla&&v!=='viewSiparis'&&!formTerkEt())return;
  document.querySelectorAll('.view').forEach(function(x){x.classList.remove('active');});
  var el=document.getElementById(v); if(el)el.classList.add('active');
  ekranCiz(v);
}

function hepsiniCiz(){ ekranlariKirlet(); }

/* ═══════════ YEREL VERİ YAMASI ═══════════
   Kayıttan sonra tüm veriyi sunucudan yeniden çekmek yerine (14 sayfa
   okuması + tüm siparişlerin aktarımı) sadece değişen kaydı günceller. */
function veriDegisti(){ DATA_SURUM++; ekranlariKirlet(); }

/**
 * Sipariş tahsilatı ve mağaza masrafı kasaya otomatik hareket yazar.
 * Mağaza rolü kasa hareketlerini görmediği için ek çağrı yapmaz; finans
 * rollerinde kasa ekranları bayat kalmasın diye hareketler tek sayfa
 * okumasıyla arka planda yenilenir.
 */
function hareketleriYenile(){
  if(!finansMi())return;
  gcall('hareketleriGetir',[TOKEN],function(h){ if(h){ DATA.hareketler=h; veriDegisti(); } });
}

function siparisYamala(kayit){
  if(!kayit||!kayit.id){ verileriYukle(false); return; }
  DATA.siparis=DATA.siparis||[];
  var i,bulundu=false;
  for(i=0;i<DATA.siparis.length;i++){
    if(DATA.siparis[i].id===kayit.id){ DATA.siparis[i]=kayit; bulundu=true; break; }
  }
  if(!bulundu)DATA.siparis.push(kayit);
  /* Müşteri yeni oluşmuş olabilir: listede yoksa yerel kartı da ekle. */
  if(kayit.musteriId){
    DATA.musteriler=DATA.musteriler||[];
    var m=null;
    for(i=0;i<DATA.musteriler.length;i++){ if(DATA.musteriler[i].id===kayit.musteriId)m=DATA.musteriler[i]; }
    if(!m)DATA.musteriler.push({id:kayit.musteriId,adSoyad:kayit.adSoyad,telefon:kayit.telefon,
      eposta:kayit.eposta,tcVergi:kayit.tcVergi,sonRecete:kayit.recete||{},notu:''});
    else { m.adSoyad=kayit.adSoyad||m.adSoyad; m.telefon=kayit.telefon||m.telefon; }
  }
  veriDegisti();
  hareketleriYenile();
}
function siparisAlanYamala(id,alanlar){
  var s=(DATA.siparis||[]).filter(function(x){return x.id===id;})[0];
  if(!s){ verileriYukle(false); return; }
  Object.keys(alanlar||{}).forEach(function(k){ s[k]=alanlar[k]; });
  veriDegisti();
  hareketleriYenile();
}
function siparisYerelKaldir(id){
  DATA.siparis=(DATA.siparis||[]).filter(function(x){return x.id!==id;});
  veriDegisti();
  hareketleriYenile();
}
function hareketYamala(kayit){
  if(!kayit||!kayit.id){ verileriYukle(false); return; }
  DATA.hareketler=DATA.hareketler||[];
  var i,bulundu=false;
  for(i=0;i<DATA.hareketler.length;i++){
    if(DATA.hareketler[i].id===kayit.id){ DATA.hareketler[i]=kayit; bulundu=true; break; }
  }
  if(!bulundu)DATA.hareketler.push(kayit);
  veriDegisti();
}
function hareketYerelKaldir(id){
  DATA.hareketler=(DATA.hareketler||[]).filter(function(x){return x.id!==id;});
  veriDegisti();
}
function hedefYamala(ay,hedef,notu){
  DATA.hedefler=DATA.hedefler||{};
  DATA.hedefler[ay]={hedef:hedef,notu:notu};
  veriDegisti();
}
function masrafYamala(kayit){
  if(!kayit||!kayit.id){ verileriYukle(false); return; }
  DATA.masraflar=DATA.masraflar||[];
  DATA.masraflar.unshift(kayit);
  veriDegisti();
  hareketleriYenile();
}
function masrafYerelKaldir(id){
  DATA.masraflar=(DATA.masraflar||[]).filter(function(x){return x.id!==id;});
  veriDegisti();
  hareketleriYenile();
}

/* ═══════════ MODAL / SEÇİCİ ═══════════ */
/*
 * Modallar üst üste açılabiliyor (örn. hareket formunun içinden kategori
 * seçici). Hepsi aynı z-index'te olduğu için sıralamayı HTML'deki yer
 * belirliyordu: seçici belgede önce geldiğinden formun ARKASINDA kalıyor,
 * tıklanamıyordu. Açılan modal, o an açık olanların en üstündekinin bir
 * üstüne yerleşir. Sırayı ayrı bir listede değil doğrudan DOM'da tuttuğumuz
 * için modal başka bir yoldan kapatılsa da z-index şişmiyor; en fazla
 * iç içe modal sayısı kadar yükselir (toast 2000'de, çakışma olmaz).
 */
function modalKapat(e,id){
  var el=document.getElementById(id);
  if(!el||(e&&e.target!==el))return;
  el.classList.remove('open');
  el.style.zIndex='';
}
function modalAc(id){
  var el=document.getElementById(id); if(!el)return;
  var enUst=1000;
  var acik=document.querySelectorAll('.overlay.open');
  for(var i=0;i<acik.length;i++){
    if(acik[i]===el)continue;
    enUst=Math.max(enUst,parseInt(acik[i].style.zIndex,10)||1000);
  }
  el.style.zIndex=enUst+1;
  el.classList.add('open');
}

/* Esc: yalnızca en üstteki modalı kapatır; altındaki form açık kalır. */
document.addEventListener('keydown',function(e){
  if(e.key!=='Escape')return;
  var ustteki=null,enUst=-1;
  var acik=document.querySelectorAll('.overlay.open');
  for(var i=0;i<acik.length;i++){
    var z=parseInt(acik[i].style.zIndex,10)||1000;
    if(z>=enUst){ enUst=z; ustteki=acik[i]; }
  }
  if(ustteki)modalKapat(null,ustteki.id);
});

var pickCtx=null;
/**
 * Genel seçici. secenekler: [{deger, etiket, alt, ikon}]
 * opts: { grid:'grid-3'|'cat'|..., geri:{etiket,fn}, temizle:fn, secili:'...' }
 */
function pickAc(baslik,secenekler,secim,opts){
  opts=opts||{};
  pickCtx={secim:secim,temizle:opts.temizle};
  document.getElementById('pickBaslik').textContent=baslik;
  document.getElementById('pickGeri').innerHTML=opts.geri
    ? '<div class="pick-back" onclick="pickGeriTikla()">‹ '+esc(opts.geri.etiket)+'</div>' : '';
  if(opts.geri)pickCtx.geri=opts.geri.fn;
  var grid=document.getElementById('pickGrid');
  grid.className='pick-grid'+(opts.grid?' '+opts.grid:'');
  grid.innerHTML=(secenekler||[]).map(function(o,i){
    var aktif=(opts.secili!==undefined&&String(opts.secili)===String(o.deger))?' active':'';
    if(opts.grid&&opts.grid.indexOf('cat')>-1){
      return '<div class="pick-opt'+aktif+'" onclick="pickSec('+i+')"><span class="cat-icon">'+esc(o.ikon||'')+'</span>'
        +'<span class="cat-name">'+esc(o.etiket)+'</span>'+(o.alt?'<span class="cat-vat">'+esc(o.alt)+'</span>':'')+'</div>';
    }
    return '<div class="pick-opt'+aktif+'" onclick="pickSec('+i+')"><span>'+esc(o.etiket)+'</span>'
      +(o.alt?'<span class="cnt">'+esc(o.alt)+'</span>':'')+(o.dallanir?'<span class="chev">›</span>':'')+'</div>';
  }).join('');
  pickCtx.secenekler=secenekler||[];
  modalAc('pickOverlay');
}
function pickSec(i){ var o=pickCtx.secenekler[i]; var f=pickCtx.secim; modalKapat(null,'pickOverlay'); if(f)f(o); }
function pickGeriTikla(){ var f=pickCtx&&pickCtx.geri; if(f)f(); }
function pickTemizle(){ var f=pickCtx&&pickCtx.temizle; modalKapat(null,'pickOverlay'); if(f)f(); }

/* Personel seçimi: mağaza rolünde zorunlu, diğer rollerde doğrudan devam */
var personelSecCtx=null;
function personelSor(varsayilan,devam){
  if(!subeRoluMu()){ devam(varsayilan||''); return; }
  var liste=(DATA.personel||[]).filter(function(p){return p.aktif!==false;});
  personelSecCtx=devam;
  document.getElementById('personelSecGrid').innerHTML=liste.map(function(p){
    var v=(varsayilan&&p.ad===varsayilan)?' active':'';
    return '<div class="pick-opt'+v+'" onclick="personelSecildi(\''+q(p.ad)+'\')">'+esc(p.ad)+'</div>';
  }).join('');
  /* Liste boşsa (yeni işletme) ya da kişi listede yoksa adı elle yazılır;
     sunucu bu adı satış personeli listesine kendiliğinden ekler. */
  var not=document.getElementById('personelSecNot');
  if(not){
    not.textContent=liste.length?'' : 'Henüz satış personeli eklenmemiş. Adınızı yazın; listeye eklenecek.';
    not.style.display=liste.length?'none':'';
  }
  var serbest=document.getElementById('personelSerbest');
  if(serbest)serbest.value=liste.length?'':(varsayilan||'');
  modalAc('personelOverlay');
}
function personelSecildi(ad){ var f=personelSecCtx; personelSecCtx=null; modalKapat(null,'personelOverlay'); if(f)f(ad); }
function personelSerbestDevam(){
  var e=document.getElementById('personelSerbest');
  var ad=e?e.value.trim():'';
  if(!ad){ toast('Listeden seçin veya adınızı yazın',false); return; }
  personelSecildi(ad);
}
function personelSecimIptal(){ personelSecCtx=null; modalKapat(null,'personelOverlay'); }

/* ═══════════ HESAPLAMA MOTORU ═══════════ */
function kategoriKdv(ad){
  var k=(DATA.urunKategorileri||[]).filter(function(x){return x.ad===ad;})[0];
  return k?k.kdv:null;
}
/** Fiyatlar KDV dahil mi girilir? (işletme ayarı) */
function kdvDahilMi(){ return !(DATA.ayar&&DATA.ayar.kdvModu==='haric'); }

/**
 * Kredi kartı komisyonu: önce bankanın kendi oranı, yoksa o taksit için
 * varsayılan oran, o da yoksa "Diğer". Oranlar işletmeye özeldir.
 */
function komisyonOrani(banka,taksit){
  if(!taksit)return 0;
  var m=(DATA.ayar&&DATA.ayar.kkKomisyon)||{};
  var b=m[banka||'']||{};
  if(b[taksit]!==undefined)return pTR(b[taksit]);
  var v=m['']||{};
  if(v[taksit]!==undefined)return pTR(v[taksit]);
  return pTR(v['Diğer']||0);
}

function personelKaydi(ad){
  return (DATA.personel||[]).filter(function(x){return x.ad===ad;})[0]||null;
}
function personelPrimMuaf(ad){ var p=personelKaydi(ad); return p?!!p.primMuaf:false; }
/** Kişiye özel oran varsa o, yoksa işletme varsayılanı; muafsa 0. */
function personelPrimOrani(ad){
  var p=personelKaydi(ad);
  if(p&&p.primMuaf)return 0;
  if(p&&p.primOrani!==null&&p.primOrani!==undefined&&p.primOrani!=='')return pTR(p.primOrani);
  return pTR((DATA.ayar&&DATA.ayar.personelPrim)||0);
}
function urunSatirToplam(p){ return pTR(p.fiyat)*(parseInt(p.adet,10)||1); }
function siparisAraToplam(s){ var t=0; (s.urunler||[]).forEach(function(p){t+=urunSatirToplam(p);}); return t; }
function siparisTahsilat(s){ var t=0; (s.odemeler||[]).forEach(function(o){ t+=(o.tip==='iade'?-1:1)*pTR(o.tutar); }); return t; }
function siparisKalan(s){ return pTR(s.tutar)-siparisTahsilat(s); }
function siparisOdendiMi(s){ return pTR(s.tutar)>0&&siparisKalan(s)<=0.005; }

/**
 * Tahsilatın KDV hariç kalan oranı (indirim dağıtılmış olarak).
 *   KDV dahil modu : fiyatın içinden ayrışır  → net = brüt/(1+oran)
 *   KDV hariç modu : fiyatın üstüne eklenir   → net = brüt
 * Kategorisi girilmemiş ürün varsa o satırın KDV'si hesaplanamaz.
 */
function siparisNetOran(s){
  var ara=siparisAraToplam(s), tutar=pTR(s.tutar);
  if(ara<=0||tutar<=0)return 1;
  var dahil=kdvDahilMi(), net=0, brut=0;
  (s.urunler||[]).forEach(function(p){
    var line=urunSatirToplam(p); if(line<=0)return;
    var kdv=kategoriKdv(p.kategori);
    var satirBrut=dahil?line:line*(1+((kdv||0)/100));
    brut+=satirBrut;
    if(kdv===null||kdv===undefined){ net+=satirBrut; return; }
    net+=dahil?(line/(1+kdv/100)):line;
  });
  if(brut<=0)return 1;
  return net/brut;
}

/** Siparişin KDV tutarı (form ve detayda gösterilir). */
function siparisKdv(s){
  var dahil=kdvDahilMi(), kdv=0;
  (s.urunler||[]).forEach(function(p){
    var line=urunSatirToplam(p); if(line<=0)return;
    var oran=kategoriKdv(p.kategori); if(!oran)return;
    kdv+=dahil?(line-line/(1+oran/100)):(line*oran/100);
  });
  var beklenen=siparisAraToplam(s)+(dahil?0:kdv);
  var tutar=pTR(s.tutar);
  /* Elle indirim varsa KDV de orantılı düşer */
  if(beklenen>0&&tutar>0&&Math.abs(tutar-beklenen)>0.005)kdv=kdv*tutar/beklenen;
  return kdv;
}

/**
 * Bir siparişin belirli dönemdeki nakit akışı.
 * donem: 'YYYY-MM-DD' | 'YYYY-MM' | '' (tümü)
 */
function siparisNakitAkis(s,donem){
  var netOran=siparisNetOran(s);
  var primOran=personelPrimOrani(s.personel);
  var kasa=0,komisyon=0;
  (s.odemeler||[]).forEach(function(o){
    if(donem&&String(o.tarih).indexOf(donem)!==0)return;
    var isaret=o.tip==='iade'?-1:1;
    var tutar=pTR(o.tutar)*isaret;
    kasa+=tutar;
    if(o.yontem==='kk')komisyon+=tutar*(komisyonOrani(o.banka,o.taksit)/100);
    if(primOran>0)komisyon+=tutar*(primOran/100);
  });
  var kdv=kasa*(1-netOran); if(kdv<0&&kasa>0)kdv=0;
  return {kasa:kasa,kdv:kdv,komisyon:komisyon,net:kasa-kdv-komisyon};
}

function aktifSiparisler(){ return (DATA.siparis||[]).filter(function(s){return !s.silindi;}); }

/** Dönemdeki tüm tahsilat (nakit esaslı) */
function donemTahsilat(donem){
  var t=0;
  aktifSiparisler().forEach(function(s){
    (s.odemeler||[]).forEach(function(o){
      if(donem&&String(o.tarih).indexOf(donem)!==0)return;
      t+=(o.tip==='iade'?-1:1)*pTR(o.tutar);
    });
  });
  return t;
}
function kasaRozetleriGuncelle(){
  /* Gün sonu kasa sayımı mağaza müdürünün işi; personel rolü görmez */
  var gorunur=magazaYonetimiMi();
  document.querySelectorAll('.stat-box').forEach(function(e){ e.style.display=gorunur?'':'none'; });
  if(!gorunur)return;
  var bugun=donemTahsilat(bugunStr()), ay=donemTahsilat(buAyStr());
  document.querySelectorAll('[id^="hdrBugun_"]').forEach(function(e){e.textContent=fTR(bugun)+' ₺';});
  document.querySelectorAll('[id^="hdrAy_"]').forEach(function(e){e.textContent=fTR(ay)+' ₺';});
}

/* ═══════════ SENKRON KUYRUĞU ═══════════ */
function kuyrukOku(){ try{return JSON.parse(localStorage.getItem('kz_kuyruk')||'[]');}catch(e){return[];} }
function kuyrukYaz(q){ try{localStorage.setItem('kz_kuyruk',JSON.stringify(q));}catch(e){} kuyrukRozetiGuncelle(); }
function kuyrugaAl(kayit){ var q=kuyrukOku().filter(function(x){return x.anahtar!==kayit.anahtar;}); q.push(kayit); kuyrukYaz(q); }
function kuyruktanCikar(anahtar){ kuyrukYaz(kuyrukOku().filter(function(x){return x.anahtar!==anahtar;})); }
function kuyrukRozetiGuncelle(){
  var b=document.getElementById('syncBanner'); if(!b)return;
  var n=kuyrukOku().length;
  document.getElementById('syncSayi').textContent=n;
  if(n>0)b.classList.add('show'); else b.classList.remove('show');
}
function kuyrugaTekrarDene(){
  var q=kuyrukOku(); if(!q.length){toast('Bekleyen kayıt yok');return;}
  toast('Kuyruk gönderiliyor...');
  var kalan=q.length, hata=0;
  q.forEach(function(k){
    gcall(k.fn,k.args,function(){ kuyruktanCikar(k.anahtar); kalan--; if(kalan===0){ toast(hata?(hata+' kayıt hâlâ gönderilemedi'):'Kuyruk temizlendi',!hata); verileriYukle(false); } },
      function(){ hata++; kalan--; if(kalan===0)toast(hata+' kayıt hâlâ gönderilemedi',false); });
  });
}

/* ═══════════ BAŞARI ANİMASYONU ═══════════ */
/**
 * Onay ekranı. `bekliyor` true ise sunucu cevabı beklenirken gösterilir
 * (dönen halka); cevap gelince aynı ekran onay animasyonuna geçer. Böylece
 * kullanıcı anında geri bildirim alır ama "kaydedildi" yazısı sunucu
 * onaylamadan gösterilmez.
 */
var basariZaman=null;
function basariGoster(kisi,baslik,bekliyor){
  var o=document.getElementById('successOverlay');
  document.getElementById('successTitle').textContent=baslik||'Harika İş Çıkardın!';
  document.getElementById('successRep').textContent=kisi?('Tebrikler '+kisi+'!'):'';
  o.classList.add('show');
  if(bekliyor)o.classList.add('bekliyor'); else o.classList.remove('bekliyor');
  if(basariZaman){ clearTimeout(basariZaman); basariZaman=null; }
  if(bekliyor)return;
  var svg=o.querySelector('.checkmark'); if(svg){ var y=svg.cloneNode(true); svg.parentNode.replaceChild(y,svg); }
  basariZaman=setTimeout(function(){o.classList.remove('show');},3000);
}
function basariKapat(){
  var o=document.getElementById('successOverlay');
  o.classList.remove('show'); o.classList.remove('bekliyor');
  if(basariZaman){ clearTimeout(basariZaman); basariZaman=null; }
}

/* ═══════════ BAŞLANGIÇ ═══════════ */
document.addEventListener('DOMContentLoaded',function(){
  ['loginEmail','loginPass'].forEach(function(id){
    var e=document.getElementById(id);
    if(e)e.addEventListener('keydown',function(ev){ if(ev.key==='Enter')doLogin(); });
  });
  ['kayitIsletme','kayitAd','kayitEposta','kayitTelefon','kayitSifre'].forEach(function(id){
    var e=document.getElementById(id);
    if(e)e.addEventListener('keydown',function(ev){ if(ev.key==='Enter')kayitOl(); });
  });
  document.addEventListener('click',function(e){
    var l=document.getElementById('spOneriler');
    if(l&&e.target.id!=='spAdSoyad')l.style.display='none';
  });
  receteTablolariniKur();
  /* Oturum Supabase tarafında saklanır: tablet kapatılıp açılsa da devam eder. */
  TOKEN='sb';
  gcall('mevcutKullaniciGetir',[TOKEN],
    function(u){ KULLANICI=u; verileriYukle(); },
    function(){ TOKEN=null; goster('viewLogin',true); });
  kuyrukRozetiGuncelle();
});
