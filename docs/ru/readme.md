# Драйвер ioBroker для работы с Zigbee-устройствами

<img src="../../admin/zigbee.png"  width="64">

При помощи координатора Zigbee-сети на базе Texas Instruments SoC cc253x (и другими) создается собственная сеть, в которую подключаются zigbee-устройства. Взаимодействуя напрямую с координатором сети, драйвер позволяет управлять устройствами без дополнительных шлюзов/бриджей от производителей устройств (Xiaomi/TRADFRI/Hue). Про устройство Zigbee-сети можно прочитать [тут (на английском языке)](https://github.com/Koenkk/zigbee2mqtt/wiki/ZigBee-network). 

Для работы необходимо одно из перечисленных устройств, прошитое специальной ZNP-прошивкой: [cc2531, cc2530, cc2530+RF](https://github.com/Koenkk/zigbee2mqtt/wiki/Supported-sniffer-devices#zigbee-coordinator)

<span><img src="https://ae01.alicdn.com/kf/HTB1Httue3vD8KJjSsplq6yIEFXaJ/Wireless-Zigbee-CC2531-Sniffer-Bare-Board-Packet-Protocol-Analyzer-Module-USB-Interface-Dongle-Capture-Packet.jpg_640x640.jpg" width="100"></span>
<span><img src="http://img.dxcdn.com/productimages/sku_429478_2.jpg" width="100"></span>
<span><img src="http://img.dxcdn.com/productimages/sku_429601_2.jpg" width="100"></span>
<span><img src="https://ae01.alicdn.com/kf/HTB1zAA5QVXXXXahapXXq6xXFXXXu/RF-TO-USB-CC2530-CC2591-RF-switch-USB-transparent-serial-data-transmission-equipment.jpg_640x640.jpg" width="100"></span>

Необходимое для прошивки оборудование и процесс подготовки устройства описан [тут (на английском языке)](https://github.com/Koenkk/zigbee2mqtt/wiki/Getting-started) или [тут (на русском языке)](https://github.com/kirovilya/ioBroker.zigbee/wiki/%D0%9F%D1%80%D0%BE%D1%88%D0%B8%D0%B2%D0%BA%D0%B0) 

Подключенные к Zigbee-сети устройства сообщают координатору своё состояние и информируют о событиях (нажатия кнопки, обнаружение движения, изменение температуры). Эти сведения отражаются в виде объектов-состояний ioBroker. Некоторые состояния имеют обратную связь и могут отправлять команды zigbee-устройству при изменении состояния (переключение состояния розетки и лампы, изменение сцены или яркости лампы).

Для запуска драйвера необходимо указать имя порта, на котором подключено устройство cc253x.

Для подключения устройств необходимо перевести координатор Zigbee-сети в режим сопряжения, нажав зеленую кнопку. Начнется обратный отсчет времени (60 сек) пока будет доступна возможность подключения устройств.
Для подключения Zigbee-устройств в большинстве случаев достаточно нажать кнопку сопряжения на самом устройстве. Но существуют особенности для некоторых устройств. Подробнее о сопряжении с устройствами читайте [тут (на английском языке)](https://github.com/Koenkk/zigbee2mqtt/wiki/Pairing-devices) или [тут (на русском языке)](https://github.com/kirovilya/ioBroker.zigbee/wiki#%D0%9F%D0%BE%D0%B4%D0%B4%D0%B5%D1%80%D0%B6%D0%B8%D0%B2%D0%B0%D0%B5%D0%BC%D1%8B%D0%B5-%D1%83%D1%81%D1%82%D1%80%D0%BE%D0%B9%D1%81%D1%82%D0%B2%D0%B0).

После успешного сопряжения, устройство появится в панели устройств. Если устройство появилось в панели устройств, но имеет тип undefined, то это неизвестное устройство и с ним нельзя будет взаимодействовать. Если устройство есть в списке доступных устройств, но добавилось как undefined, то попробуйте удалить устройство и добавить заново.
