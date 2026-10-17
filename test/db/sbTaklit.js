/**
 * Supabase JS istemcisinin test taklidi: RPC çağrılarını PGlite üzerindeki
 * gerçek veritabanına yönlendirir, auth çağrılarını oturum değiştirmeye
 * çevirir.
 *
 * Böylece arayüz kodu (web/js/*.js) hiç değiştirilmeden, gerçek şema ve
 * gerçek RLS politikalarına karşı test edilebilir.
 */

function sbTaklitOlustur(testDb, kullanicilar) {
  /* kullanicilar: { 'email': { uid, sifre } } */
  var oturum = null;

  async function rolUygula() {
    if (oturum) await testDb.oturumAc(oturum.uid);
    else await testDb.sistem();
  }

  /**
   * gecici=true → supabase-js'in persistSession:false ile açılan ikinci
   * istemcisi: signUp ana oturumu BOZMAZ (yönetici kullanıcı eklerken).
   */
  function istemci(gecici) {
    return {
      _oturum: function () {
        return oturum;
      },
      auth: {
        signInWithPassword: async function (p) {
          const k = kullanicilar[String(p.email || '').toLowerCase()];
          if (!k || k.sifre !== p.password) {
            return { data: null, error: { message: 'Invalid login credentials' } };
          }
          oturum = { uid: k.uid, email: p.email };
          await rolUygula();
          return { data: { session: { user: { id: k.uid, email: p.email } } }, error: null };
        },
        getSession: async function () {
          return { data: { session: oturum ? { user: { id: oturum.uid } } : null }, error: null };
        },
        signOut: async function () {
          oturum = null;
          await rolUygula();
          return { error: null };
        },
        signUp: async function (p) {
          const email = String(p.email || '').toLowerCase();
          if (kullanicilar[email]) return { data: null, error: { message: 'already registered' } };
          const onceki = oturum;
          const uid = await testDb.kullaniciOlustur(email);
          kullanicilar[email] = { uid: uid, sifre: p.password };
          /* Gerçek davranış: kendi kaydında oturum yeni kullanıcıya geçer,
           ikinci (geçici) istemcide ana oturum korunur. */
          oturum = gecici ? onceki : { uid: uid, email: email };
          await rolUygula();
          return {
            data: {
              user: { id: uid, email: email },
              session: gecici ? null : { user: { id: uid, email: email } }
            },
            error: null
          };
        },
        updateUser: async function (p) {
          if (!oturum) return { error: { message: 'Auth session missing' } };
          kullanicilar[oturum.email.toLowerCase()].sifre = p.password;
          return { error: null };
        },
        resetPasswordForEmail: async function () {
          return { error: null };
        }
      },

      /* Storage taklidi: dosya içeriği tutulmaz, yetki politikası sınanır. */
      storage: {
        from: function (kova) {
          return {
            upload: async function (yol, dosya, opts) {
              await rolUygula();
              try {
                if (opts && opts.upsert) {
                  await testDb.calistir('delete from storage.objects where bucket_id = $1 and name = $2', [
                    kova,
                    yol
                  ]);
                }
                await testDb.calistir(
                  'insert into storage.objects (bucket_id, name, owner) values ($1, $2, $3)',
                  [kova, yol, oturum ? oturum.uid : null]
                );
                return { data: { path: yol }, error: null };
              } catch (e) {
                return { data: null, error: { message: e.message || String(e) } };
              }
            },
            getPublicUrl: function (yol) {
              return {
                data: { publicUrl: 'https://test.supabase.co/storage/v1/object/public/' + kova + '/' + yol }
              };
            },
            remove: async function (yollar) {
              await rolUygula();
              await testDb.calistir('delete from storage.objects where bucket_id = $1 and name = any($2)', [
                kova,
                yollar
              ]);
              return { data: null, error: null };
            }
          };
        }
      },

      rpc: async function (ad, parametreler) {
        await rolUygula();
        const adlar = Object.keys(parametreler || {});
        const degerler = [];
        const parcalar = adlar.map(function (k, i) {
          const v = parametreler[k];
          degerler.push(v !== null && typeof v === 'object' ? JSON.stringify(v) : v);
          return k + ' := $' + (i + 1);
        });
        const sql = 'select ' + ad + '(' + parcalar.join(', ') + ') as sonuc';
        try {
          const r = await testDb.calistir(sql, degerler);
          return { data: r.rows[0] ? r.rows[0].sonuc : null, error: null };
        } catch (e) {
          return { data: null, error: { message: e.message || String(e) } };
        }
      }
    };
  }

  return {
    createClient: function (url, anahtar, opts) {
      return istemci(!!(opts && opts.auth && opts.auth.persistSession === false));
    },
    oturum: function () {
      return oturum;
    }
  };
}

module.exports = { sbTaklitOlustur };
