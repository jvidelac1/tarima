// Lista corta de dominios de mail descartable, embebida en el Worker (docs/MVP.md 5.5).
// No pretende ser completa: frena lo más común sin depender de un servicio externo. Se compara el dominio y sus padres.
export const DESCARTABLES = new Set(`
10minutemail.com 10minutemail.net 20minutemail.com 33mail.com
anonaddy.me burnermail.io
discard.email discardmail.com disposablemail.com dispostable.com dropmail.me
emailondeck.com emailfake.com emailtemp.org emltmp.com example.com example.net example.org
fakeinbox.com fakemail.net fakemailgenerator.com
getairmail.com getnada.com grr.la guerrillamail.biz guerrillamail.com guerrillamail.de guerrillamail.info guerrillamail.net guerrillamail.org guerrillamailblock.com
harakirimail.com
inboxbear.com inboxkitten.com
jetable.org
mail.tm mail-temp.com mailcatch.com maildrop.cc mailinator.com mailinator.net mailinator2.com mailnesia.com mailpoof.com mailsac.com mailtemp.net mintemail.com mohmal.com moakt.com mytemp.email mytrashmail.com
nada.email nwldx.com
one-time.email
pokemail.net
sharklasers.com spam4.me spamgourmet.com spambox.us spamdecoy.net
temp-mail.io temp-mail.org tempail.com tempemail.net tempinbox.com tempmail.com tempmail.dev tempmail.net tempmail.plus tempmailo.com tempr.email throwawaymail.com tmail.ws tmpmail.net tmpmail.org trash-mail.com trashmail.com trashmail.de trashmail.io trashmail.net
wegwerfmail.de wegwerfmail.net
yopmail.com yopmail.fr yopmail.net
`.split(/\s+/).filter(Boolean));
