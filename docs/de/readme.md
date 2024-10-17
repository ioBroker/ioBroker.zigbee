# ioBroker Adapter für Zigbee-Geräte
Mit Hilfe eines Koordinators für ZigBee-Netze, basierend auf dem Chip "Texas Instruments CC253x" (und anderen), wird ein eigenes ZigBee-Netz erschaffen, dem ZigBee-Geräte (Lampen, Dimmer, Sensoren, …) beitreten können. Dank der direkten Interaktion mit dem Koordinator erlaubt der ZigBee-Adapter die Steuerung der Geräte ohne jegliche Gateways/Bridges der Hersteller (Xiaomi/Tradfri/Hue). Zusätzliche Informationen zu ZigBee kann man hier [hier nachlesen (Englisch)](https://github.com/Koenkk/zigbee2mqtt/wiki/ZigBee-network).

## Die Hardware
Für den Koordinator (siehe oben) ist eine zusätzliche Hardware erforderlich, welche die Umsetzung zwischen USB und ZigBee-Funksignalen ermöglicht. Es gibt 2 Gruppen:

   - Aufsteckmodul für den RaspberryPi (wird nicht mehr verwendet da veraltet und keine Zigbee 3.0 Unterstützung)<br>
   - USB-Stick ähnliche Hardware

![](img/CC2531.png)
![](img/sku_429478_2.png)
![](img/cc26x2r.PNG)
![](img/CC2591.png)
![](img/sonoff.png)


Bei manchen dieser Geräte ist zum Betrieb das Aufspielen einer geeigneten Firmware erforderlich:
Bitte schaut zuerst wie die entsprechenden Koordinatoren geflasht werden müssen. Die Firmware ist [hier](https://github.com/Koenkk/Z-Stack-firmware) zu fimden.

Zunehmend beliebt kommt der "Sonoff ZIGBEE 3.0 USB-STICK CC2652P" zum Einsatz:
![](img/sonoff.png)

   - Flashen einer passenden Firmware nicht zwingend erforderlich (Ware wird bereits mit geeigneter Firmware ausgeliefert) <br>
   - Unterstützt den neueren ZigBee 3.0 Standard

Die mit dem ZigBee-Netz verbundenen Geräte übermitteln dem Koordinator ihren Zustand und benachrichtigen über Ereignisse (Knopfdruck, Bewegungserkennung, Temperaturänderung, …). Diese Infos werden im Adapter unter den jeweiligen ioBroker-Objekten angezeigt und können so in ioBroker weiterverarbeitet werden. Außerdem ist es möglich Kommandos an das ZigBee-Gerät zu senden (Zustandsänderung Steckdosen und Lampen, Farb- und Helligkeitseinstellungen, …).


## Die Software

Die Software wird unterteilt in "Konverter" und "Adapter".

![](img/software1.jpg)

   - Konverter <br>
    Der Konverter gliedert sich auf in zwei Teile: <br>
    a) Allgemeine Bereitstellung der Daten aus den ZigBee-Funksignalen. Dieser [Softwareteil](https://github.com/Koenkk/zigbee-herdsman) wird für alle ZigBee-Geräte verwendet.  <br>
    b) Gerätespezifische [Aufbereitung](https://github.com/Koenkk/zigbee-herdsman-converters) der Daten auf eine definierte Schnittstelle zum Adapter. <br>
    
   - Adapter <br>
    Dieser Softwareteil ist die Anbindung des Konverters an ioBroker. Der [Adapter](https://github.com/ioBroker/ioBroker.zigbee) beinhaltet die grafische Darstellung zur Verwaltung der ZigBee-Geräte, sowie die Erzeugung der ioBroker-Objekte zur Steuerung der ZigBee-Geräte.
    
## Installation
1.	Koordinator Hardware am RaspberryPi anstecken.<br>
2.	Über z.B. PuTTY mit RaspberryPi verbinden.<br>
3.	Eventuell vorhandene ZigBee-Backupdatei löschen. Andernfalls wird der ZigBee-Adapter in ioBroker nicht grün und im ioBroker Log steht, dass der Adapter falsch konfiguriert ist.<br>
sudo rm /opt/iobroker/iobroker-data/zigbee_0/nvbackup.json<br>
4.	Pfad des Koordinators ermitteln:
`ls -la /dev/serial/by-id/`
![](img/Bild2.png)
5.	ioBroker -> ZigBee-Adapter installieren, hier als Beispiel die Version 1.8.10 <br> ![](img/Bild3.png)  <br> Hiermit werden alle erforderlichen Softwareteile (Konverter und Adapter) installiert.
6. Adapter öffnen -> ![](img/Bild4.png) -> Zuvor ermittelten Pfad des Koordinators mit dem Zusatz /dev/serial/by-id/ eintragen:![](img/Bild5.jpg) <br> Es ist zu achten, dass am Ende kein leer Zeichen mitgenommen wird
7.	Netzwerk-ID und Pan ID vergeben zur Unterscheidung von anderen ZigBee-Netzwerken in Funkreichweite, z.B. <br>
   ![](img/Bild6.png) ![](img/Bild7.png) <br> ![](img/Bild8.png) ![](img/Bild9.png)
8.	Prüfen ob der Adapter in ioBroker grün wird. Sollzustand: <br> ![](img/Bild10.png) <br> Andernfalls ioBroker Log lesen und Fehlerursache suchen, im Forum stehen viele Lösungsansätze.

## Pairing
Jedes ZigBee-Gerät (Schalter, Lampe, Sensor, …) muss mit dem Koordinator gekoppelt werden (Pairing):  <br>

   - ZigBee-Gerät:
    Jedes **ZigBee-Gerät** kann nur mit genau 1 ZigBee-Netzwerk verbunden sein. Hat das ZigBee-Gerät noch Pairing-Informationen zu einem fremden Koordinator (z.B. Philips Hue Bridge) gespeichert, dann muss es von diesem ZigBee-Netzwerk zuerst entkoppelt werden. Dieses Entkoppeln vom alten ZigBee-Netzwerk erfolgt vorzugsweise über die Bedienoberfläche des alten ZigBee-Netzwerkes (z.B. Philips Hue App). Alternativ kann man das ZigBee-Gerät auf Werkseinstellungen zurücksetzen.  <br>
    Um ein ZigBee-Gerät nun in den Pairing-Mode zu versetzen, gibt es typischerweise folgende Möglichkeiten: <br>
        1.	ZigBee-Gerät von einem ZigBee-Netzwerk entkoppeln  
        2.	Pairing-Button am ZigBee-Gerät drücken  
        3.	Versorgungsspannung des ZigBee-Gerätes aus- und dann wieder einschalten  
      
Danach ist das ZigBee-Gerät für typischerweise 60 Sekunden im Pairing-Mode. <br>
Ähnlich wie die Vorgehensweise zum Rücksetzen auf Werkseinstellungen ist auch das Aktivieren des Pairing-Mode abhängig vom jeweiligen Gerätetyp (ggf. Bedienungsanleitung des ZigBee-Gerätes lesen).  <br>

   - Koordinator:
Grünen Knopf drücken, um den Koordinator für 60 Sekunden (oder die in den Adaptereinstellungen gewählte Zeit) in den Pairing-Mode zu versetzen. <br>
![](img/Bild12.png)

   - Warten bis im Dialog "New device joined" erscheint: 
![](img/Bild13.png)

   - Pairing überprüfen:
Das zu koppelnde Gerät muss vom ioBroker ZigBee-Adapter unterstützt werden. Im Gutfall wird im ZigBee-Adapter ein neues Gerät angezeigt (z.B. Philips Light Stripe) und entsprechende ioBroker-Objekte angelegt:
![](img/Bild14.png) ![](img/Bild15.png)

   - Im Schlechtfall wird das ZigBee-Gerät aktuell noch nicht unterstützt. Im nächsten Abschnitt ist beschrieben, was zu tun ist, um dieses ZigBee-Gerät dennoch nutzen zu können.

## Pairing von bisher unbekannten ZigBee-Geräten

Bei bisher unbekannten ZigBee-Geräten erscheint beim Pairing der ZigBee-Name des ZigBee-Gerätes (z.B. HOMA1001) mit dem Zusatz "not described in statesMapping" <br>
![](img/Bild28.png) <br>
![](img/Bild16.png) <br>

Durch Drehen dieser Kachel erhält man Detailinformationen zu dem ZigBee-Gerät: <br>
![](img/Bild17.png) ![](img/Bild18.png) <br>

Nach einer Registrierung bei [github.com](https://github.com/ioBroker/ioBroker.zigbee/issues) kann über einen "Issue" das fehlende ZigBee-Gerät gemeldet werden:

![](img/Bild19.png) <br>

• Detailinformationen der Kachel (siehe oben) in dem Issue einfügen, erstelle eine kurze Dokumentation (vorzugweise auf Englisch) und absenden. Ein Entwickler wird sich daraufhin über den Issue melden.

Nach Anpassung der relevanten Dateien muss der ZigBee-Adapter neu gestartet und dann das ZigBee-Gerät vom Koordinator entkoppelt werden (unpair):
Danach kann das Pairing wiederholt werden. Sollzustand nach dem Pairing: <br>
![](img/Bild21.png) <br>

Bei manchen ZigBee-Geräten ist es erforderlich alle Softwareschnittstellen ("exposes") des neuen ZigBee-Gerätes in den ioBroker-Objekten anzuzeigen, um alle Funktionen des ZigBee-Gerätes nutzen zu können. In solchen Fällen muss das neue ZigBee-Gerät in die "Ausschliessen"-Gruppe aufgenommen werden. 

![](img/Bild22.png) <br>

![](img/Bild23.png) -> ![](img/Bild24.png) -> ![](img/Bild25.png) -> ZigBee-Gerät (z.B. HOMA1001) auswählen  -> ![](img/Bild26.png)    <br>
Nach einem Neustart des ZigBee-Adapters sollte das neue ZigBee-Gerät nun uneingeschränkt funktionieren.

## Symbole im ZigBee-Adapter
    
| Bild                | Beschreibung                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
|---------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| ![](img/Bild30.png) | **State Cleanup** <br> Löschen von ungültigen ioBroker-Objekten, welche durch den Vorgang "Ausschliessen" entstehen können.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ![](img/Bild31.png) | **Auf Firmware Updates überprüfen** <br> Firmware der ZigBee-Geräte (z.B. Philips Hue Lampen) aktualisieren                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ![](img/Bild32.png) | **Add Group**  <br>Über diese Funktion können mehrere ZigBee-Geräte zu einer logischen Gruppe zusammengefasst werden und dann über ein ioBroker-Objekt gemeinsam angesteuert werden, z.B. brightness=20 dann wird bei allen ZigBee-Geräten der Gruppe brightness auf 20 gesetzt.                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ![](img/Bild33.png) | **Touchlink zurücksetzen und koppeln** <br> Touchlink ist eine Funktion von ZigBee, die es physisch nahe beieinander liegenden Geräten ermöglicht, miteinander zu kommunizieren, ohne sich im selben Netzwerk zu befinden. Diese Funktion wird nicht von allen Geräten unterstützt. Um ein ZigBee-Gerät über Touchlink auf Werkseinstellungen zurückzusetzen, bringe das Gerät in die Nähe (< 10 cm) des ZigBee-Koordinators und drücke dann das grüne Symbol.                                                                                                                                                                                                                                               |
| ![](img/Bild34.png) | **Pairing mit QR Code**  <br>Bei manchen ZigBee-Geräten erfolgt das Pairing mittels QR-Code.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ![](img/Bild35.png) | **Pairing**  <br> Anlernvorgang neuer ZigBee-Geräte (Pairing) starten.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ![](img/Bild36.png) | Zeit seit mit diesem ZigBee-Gerät  <br> zuletzt ein Datenaustausch stattgefunden hat.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ![](img/Bild37.png) | Stärke des ZigBee-Funksignals <br> an diesem ZigBee-Gerät (<10 schlecht, <50 mittel, >50 gut).ZigBee ist ein Funk-Mesh-Netzwerk (mesh = vermascht). Die meisten netzbetriebenen ZigBee-Geräte (z.B. Philips Hue Lampe) können als ZigBee-Router wirken, also als Funkknotenpunkt. ZigBee-Geräte müssen somit nicht zwingend eine direkte Funkverbindung zum Koordinator aufbauen, sondern können stattdessen jeden Router im Netzwerk zur Funkverbindung nutzen. Mit jedem ZigBee-Router wird somit die Funkreichweite des Netzwerkes erweitert. Alle ZigBee-Geräte prüfen regelmäßig, ob es eine bessere Funkroute gibt und stellen sich automatisch um. Dieser Vorgang kann jedoch etliche Minuten dauern. |

## Zusätzliche Informationen
Es gibt noch ein [Freundschaftsprojekt](https://www.zigbee2mqtt.io/) mit gleichen Funktionen und gleicher Technologie, welcher mit denselben Geräten über ein MQTT Protokoll kommuniziert. Wenn irgendwelche Verbesserungen oder neu unterstütze Geräte im Projekt ZigBee2MQTT eingefügt werden, können jene auch in dieses Projekt hinzugefügt werden. Solltet Ihr Unterschiede merken, schreibt bitte ein Issue und wir kümmern uns darum.
Weitere Themen zu diesem Adapter sind auch im zugehörigen [Wiki](https://github.com/ioBroker/ioBroker.zigbee/wiki) dokumentiert.

