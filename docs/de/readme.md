# ioBroker Adapter für Zigbee-Geräte
Mit Hilfe eines Koordinators für ZigBee-Netze, basierend auf dem Chip "Texas Instruments CC253x" (und anderen), wird ein eigenes ZigBee-Netz erschaffen, dem ZigBee-Geräte (Lampen, Dimmer, Sensoren, …) beitreten können. Dank der direkten Interaktion mit dem Koordinator erlaubt der ZigBee-Adapter die Steuerung der Geräte ohne jegliche Gateways/Bridges der Hersteller (Xiaomi/Tradfri/Hue). Zusätzliche Informationen zu ZigBee kann man hier [hier nachlesen (Englisch)](https://github.com/Koenkk/zigbee2mqtt/wiki/ZigBee-network).

## Die Hardware
Für den Koordinator (siehe oben) ist eine zusätzliche Hardware erforderlich, welche die Umsetzung zwischen USB und ZigBee-Funksignalen ermöglicht. Es gibt 2 Gruppen:

•	Aufsteckmodul für den RaspberryPi (wird nicht mehr verwendet da veraltet und keine zigbee 3.0 unterstützung)<br>
•	USB-Stick ähnliche Hardware

![](img/CC2531.png)
![](img/sku_429478_2.png)
![](img/cc26x2r.PNG)
![](img/CC2591.png)
![](img/sonoff.png)


Bei manchen dieser Geräte ist zum Betrieb das Aufspielen einer geeigneten Firmware erforderlich:
Der benötigte Flasher/Programmer und der Prozess der Vorbereitung werden [hier (Englisch)](https://github.com/Koenkk/zigbee2mqtt/wiki/Getting-started) oder [hier (Russisch)](https://github.com/kirovilya/ioBroker.zigbee/wiki/%D0%9F%D1%80%D0%BE%D1%88%D0%B8%D0%B2%D0%BA%D0%B0) beschrieben. 

Zunehmend beliebt kommt der "Sonoff ZIGBEE 3.0 USB-STICK CC2652P" zum Einsatz:
![](img/sonoff.png)

•	Flashen einer passenden Firmware nicht zwingend erforderlich (Ware wird bereits mit geeigneter Firmware ausgeliefert) <br>
•	Unterstützt den neueren ZigBee 3.0 Standard

Die mit dem ZigBee-Netz verbundenen Geräte übermitteln dem Koordinator ihren Zustand und benachrichtigen über Ereignisse (Knopfdruck, Bewegungserkennung, Temperaturänderung, …). Diese Infos werden im Adapter unter den jeweiligen ioBroker-Objekten angezeigt und können so in ioBroker weiterverarbeitet werden. Außerdem ist es möglich Kommandos an das ZigBee-Gerät zu senden (Zustandsänderung Steckdosen und Lampen, Farb- und Helligkeitseinstellungen, …).


## Die Software

Die Software wird unterteilt in "Konverter" und "Adapter".

![](img/software1.jpg)

•	Konverter
    Der Konverter gliedert sich auf in zwei Teile: <br>
    a) Allgemeine Bereitstellung der Daten aus den ZigBee-Funksignalen. Dieser [Softwareteil](https://github.com/Koenkk/zigbee-herdsman) wird für alle ZigBee-Geräte verwendet.  <br>
    b) Gerätespezifische [Aufbereitung](https://github.com/Koenkk/zigbee-herdsman-converters) der Daten auf eine definierte Schnittstelle zum Adapter. <br>
    
•	Adapter
    Dieser Softwareteil ist die Anbindung des Konverters an ioBroker. Der [Adapter](https://github.com/ioBroker/ioBroker.zigbee) beinhaltet die grafische Darstellung zur Verwaltung der ZigBee-Geräte, sowie die Erzeugung der ioBroker-Objekte zur Steuerung der ZigBee-Geräte.
    
## Installation
1.	Koordinator Hardware am RaspberryPi anstecken.<br>
2.	Über z.B. PuTTY mit RaspberryPi verbinden.<br>
3.	Eventuell vorhandene ZigBee-Backupdatei löschen. Andernfalls wird der ZigBee-Adapter in ioBroker nicht grün und im ioBroker Log steht, dass der Adapter falsch konfiguriert ist.<br>
sudo rm /opt/iobroker/iobroker-data/zigbee_0/nvbackup.json<br>
4.	Pfad des Koordinators ermitteln:
