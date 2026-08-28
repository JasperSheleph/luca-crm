-- ============================================================
-- Service area and city aliases, corrected against the real import.
--
-- After importing 1,073 Meta leads, 311 of them (29%) had a city the system did
-- not recognise. Almost all were real Tamil Nadu and Puducherry towns simply
-- missing from the seeded list, not bad data — so they were being treated as
-- outside the service area.
--
-- Matching is an exact lookup AFTER normalisation (lowercase, punctuation
-- stripped, whitespace collapsed, alias applied). There is no fuzzy matching,
-- deliberately: a near-miss guess that silently files a Chennai lead under
-- Coimbatore is worse than an honest "not recognised". The cost is that this
-- list needs extending as new towns appear, which an admin can do from
-- Settings without a developer.
-- ============================================================

update app_settings set value = '[
  "chennai","tambaram","chengalpattu","thiruvallur","kanchipuram","arakkonam",
  "coimbatore","tirupur","pollachi","gobichettipalayam","sathyamangalam","annur","valparai",
  "madurai","theni","dindigul","palani","cumbum","usilampatti",
  "tiruchirappalli","karur","perambalur","ariyalur","kumbakonam","thanjavur",
  "mayiladuthurai","nagapattinam","tiruvarur","pudukkottai",
  "salem","namakkal","erode","dharmapuri","krishnagiri","hosur","attur",
  "vellore","ranipet","tirupattur","vaniyambadi","ambur","tiruvannamalai","arni",
  "villupuram","kallakurichi","cuddalore","chidambaram","virudhachalam",
  "tirunelveli","tenkasi","ambasamudram","nagercoil","marthandam","kanyakumari",
  "tuticorin","sivakasi","virudhunagar","ramanathapuram","sivaganga","rameswaram",
  "ooty","coonoor","kotagiri","krishnagiri","kangayam","sivakasi",
  "puducherry","karaikal","yanam","mahe"
]'::jsonb
where key = 'service_area_cities';

-- Spellings that actually appeared in their data, mapped onto the canonical
-- name above. Admins extend this from Settings; never in code.
update app_settings set value = '{
  "trichy":"tiruchirappalli",
  "tiruchi":"tiruchirappalli",
  "trichirappalli":"tiruchirappalli",
  "tiruchchirappalli":"tiruchirappalli",
  "tiruchirapalli":"tiruchirappalli",
  "madras":"chennai",
  "channai":"chennai",
  "chennei":"chennai",
  "chenai":"chennai",
  "cbe":"coimbatore",
  "covai":"coimbatore",
  "kovai":"coimbatore",
  "coimbature":"coimbatore",
  "tiruppur":"tirupur",
  "thiruppur":"tirupur",
  "tirupper":"tirupur",
  "pondy":"puducherry",
  "pondicherry":"puducherry",
  "pondichery":"puducherry",
  "tuty":"tuticorin",
  "thoothukudi":"tuticorin",
  "thoothukkudi":"tuticorin",
  "nellai":"tirunelveli",
  "thirunelveli":"tirunelveli",
  "tirunelvelli":"tirunelveli",
  "udhagamandalam":"ooty",
  "udagamandalam":"ooty",
  "nilgiris":"ooty",
  "kanniyakumari":"kanyakumari",
  "nagercoil":"nagercoil",
  "thanjavoor":"thanjavur",
  "tanjore":"thanjavur",
  "vellor":"vellore",
  "madurai ":"madurai",
  "thiruvallur":"thiruvallur",
  "tiruvallur":"thiruvallur",
  "arakonam":"arakkonam",
  "arrakonam":"arakkonam",
  "virudhachalam":"virudhachalam",
  "vriddhachalam":"virudhachalam"
}'::jsonb
where key = 'city_aliases';
