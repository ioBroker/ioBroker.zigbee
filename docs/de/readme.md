# ioBroker Adapter für Zigbee-Geräte
Mit Hilfe eines Koordinators für Zigbee-Netz, basierend auf Texas Instruments SoC cc253x (und anderen), wird ein eigenes Netz erschaffen, welchem sich andere Zigbee Geräte beitreten können. Dank der direkten Interaktion mit dem Koordinator, erlaubt der Zigbee Adapter die Steuerung der Geräte ohne jegliche Gateways/Bridges der Hersteller (Xiaomi/Tradfri/Hue). Über Funktionsweise der Zigbee-Netze kann man [hier nachlesen (Englisch)](https://github.com/Koenkk/zigbee2mqtt/wiki/ZigBee-network).

## Die Hardware
Für die Umsetzung wird einer der aufgezählten Geräte/Sticks verwendet, welche mit spezieller ZNP-Firmware geflasht sind: [cc2530, cc2530, cc2530+RF.](https://github.com/Koenkk/zigbee2mqtt/wiki/Supported-sniffer-devices#zigbee-coordinator)

<span><img src="https://ae01.alicdn.com/kf/HTB1Httue3vD8KJjSsplq6yIEFXaJ/Wireless-Zigbee-CC2531-Sniffer-Bare-Board-Packet-Protocol-Analyzer-Module-USB-Interface-Dongle-Capture-Packet.jpg_640x640.jpg" width="100"></span>
<span><img src="http://img.dxcdn.com/productimages/sku_429478_2.jpg" width="100"></span>
<span><img src="http://img.dxcdn.com/productimages/sku_429601_2.jpg" width="100"></span>
<span><img src="https://ae01.alicdn.com/kf/HTB1zAA5QVXXXXahapXXq6xXFXXXu/RF-TO-USB-CC2530-CC2591-RF-switch-USB-transparent-serial-data-transmission-equipment.jpg_640x640.jpg" width="100"></span>

Der benötigte Flasher/Programmer und der Prozess der Vorbereitung werden [hier (Englisch)](https://github.com/Koenkk/zigbee2mqtt/wiki/Getting-started) oder [hier (Russisch)](https://github.com/kirovilya/ioBroker.zigbee/wiki/%D0%9F%D1%80%D0%BE%D1%88%D0%B8%D0%B2%D0%BA%D0%B0) beschrieben. 

Die mit dem Zigbee-Netz verbundenen Geräte übermitteln dem Koordinator ihren Zustand und benachrichtigen über Ereignisse (Knopfdruck, Bewegungserkennung, Temperaturänderung). Diese Infos werden im Adapter unter den jeweiligen Objekten angezeigt. Außerdem ist es möglich manche Ereignisse/Status zurück zum Zigbee-Gerät zusenden (Zustandsänderung Steckdosen und Lampen, Farb- und Helligkeitseinstellungen).

## Einstellungen und Pairing
![](https://raw.githubusercontent.com/kirovilya/files/master/config.PNG)

Zu Beginn muss der USB-Port angegeben werden, an welchem der cc253x angeschlossen ist. Wie man diesen Erkennt ist [hier beschrieben (Russisch)](https://github.com/kirovilya/ioBroker.zigbee/wiki#%D0%9D%D0%B0%D1%81%D1%82%D1%80%D0%BE%D0%B9%D0%BA%D0%B0-%D0%B0%D0%B4%D0%B0%D0%BF%D1%82%D0%B5%D1%80%D0%B0)

Zum Verbinden der Geräte muss der Koordinator für Zigbee-Netz in den Pairingmodus versetzt werden, dazu auf den grünen Knopf im Adapter klicken. Pairingmodus ist ab jetzt für 60 Sekunden aktiv. Um die Geräte zu verbinden, reicht im Normallfall ein Betätigen des Knopfes auf dem zu verbindendem Gerät. Es gibt aber auch „besondere“ Geräte. Wie man diese verbindet ist [hier Englisch](https://github.com/Koenkk/zigbee2mqtt/wiki/Pairing-devices) [oder Russisch](https://github.com/kirovilya/ioBroker.zigbee/wiki#%D0%9F%D0%BE%D0%B4%D0%B4%D0%B5%D1%80%D0%B6%D0%B8%D0%B2%D0%B0%D0%B5%D0%BC%D1%8B%D0%B5-%D1%83%D1%81%D1%82%D1%80%D0%BE%D0%B9%D1%81%D1%82%D0%B2%D0%B0) beschrieben.

Nach erfolgreichem Pairing, wird das Gerät im Adapter angezeigt. Sollte ein Gerät (aus der Liste) den Namen „undefined“ haben, dann versucht es zu löschen und nochmal zu pairen. Sollte es trotzdem nicht funktionieren, schreibt bitte ein Issue.
Zigbee-Geräte die nicht in der Liste aufgeführt sind, können zwar gepairt werden, aber der Adapter kann mit diesen nicht kommunizieren.

## Zusätzliche Informationen
Es gibt noch ein [Freundschaftprojekt](https://github.com/koenkk/zigbee2mqtt) mit gleichen Funktionen und gleicher Technologie, welcher mit denselben Geräten über ein MQTT Protokoll kommuniziert. Wenn irgendwelche Verbesserungen oder neu unterstütze Geräte im Projekt Zigbee2MQTT eingefügt werden, können jene auch in dieses Projekt hinzugefügt werden. Solltet Ihr unterschiede merken, schreibt bitte ein Issue, wir kümmern uns darum
