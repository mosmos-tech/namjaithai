# คำแปลเนื้อหาประเภทเหตุ (ไทย → English) — TF-63

ตารางนี้คัดจากทะเบียนประเภทเหตุ `src/lib/domain/incidents/*.ts` (ที่เดียวกับที่ฟอร์ม SOS ใช้) ณ ตอนทำ TF-63 เพื่อให้ผู้ตรวจของ TF-73 ตรวจคำแปลไปพร้อมกับเนื้อหาไทย

- คำแนะนำระหว่างรอเป็นเนื้อหาด้านความปลอดภัย แปลให้ตรงความหมาย ไม่เพิ่มไม่ตัดคำแนะนำ (unit test ตรวจว่าจำนวนข้อเท่าเดิม)
- ตัวจริงอยู่ในไฟล์ทะเบียนเหตุ (ช่อง `en`) — แก้คำแปลที่นั่นแล้วอัปเดตตารางนี้ให้ตรง
- ข้อความหน้าจออื่นของผู้แจ้ง (ปุ่ม ขั้นตอน หน้าติดตาม สายด่วน) อยู่ใน `src/lib/i18n/reporter-text.en.ts`

## ข้อสังเกตสำหรับผู้ตรวจ

- `ROAD_ACCIDENT` สัญญาณอันตราย `TRAPPED_IN_VEHICLE` แก้คำพิมพ์ผิดภาษาไทยใน TF-63 ("อัดก๊อปปี้" → "มีผู้ติดค้างอยู่ในยานพาหนะ")
- คำถามและตัวเลือกที่มีภาษาอังกฤษอยู่ก่อน TF-63 (ไฟไหม้ อุบัติเหตุ แพทย์ ฯลฯ) ใช้ตามเดิม ยังไม่ได้ผ่านการตรวจ
- เบอร์ตำรวจท่องเที่ยว 1155 (หน้า /en/hotlines) ตรวจกับ https://www.touristpolice.go.th/en/post/tpbnews2026102203

## น้ำท่วม / Flood (`FLOOD`)

| ช่อง | ไทย | English |
|---|---|---|
| ชื่อประเภท | น้ำท่วม | Flood |
| หัวข้อจำนวนคน | จำนวนผู้ติดค้าง | People trapped |
| คำถาม `waterLevel` | ระดับน้ำรอบตัวคุณ | Water level around you |
| ตัวเลือก `waterLevel.ROOF` | บนหลังคา / ดาดฟ้า | On the roof / rooftop |
| ตัวเลือก `waterLevel.FIRST_FLOOR` | ท่วมชั้น 1 (อยู่ชั้น 2) | Ground floor flooded (I'm upstairs) |
| ตัวเลือก `waterLevel.WAIST_CHEST` | ระดับเอว–หน้าอก | Waist to chest deep |
| ตัวเลือก `waterLevel.ANKLE_KNEE` | ระดับข้อเท้า–เข่า | Ankle to knee deep |
| ตัวเลือก `waterLevel.SURROUNDED` | ถูกน้ำล้อม / ตัดขาด | Surrounded by water / cut off |
| คำถาม `canSelfEvacuate` | ออกจากที่นั่นเองได้ไหม | Can you get out of there by yourself? |
| คำถาม `hasInjured` | มีผู้บาดเจ็บ (ยังรู้สึกตัว) | Someone is injured (still conscious) |
| สัญญาณอันตราย `UNCONSCIOUS` | มีคนหมดสติ | Someone is unconscious |
| สัญญาณอันตราย `ABNORMAL_BREATHING` | มีคนหายใจผิดปกติ | Someone is breathing abnormally |
| สัญญาณอันตราย `SEVERE_BLEEDING` | มีคนเลือดออกมาก | Someone is bleeding heavily |
| สัญญาณอันตราย `CHEST_PAIN` | มีคนเจ็บหน้าอก | Someone has chest pain |
| สัญญาณอันตราย `PERSON_IN_WATER` | มีคนอยู่ในน้ำ | Someone is in the water |
| คำแนะนำระหว่างรอ 1 ([ที่มา](https://www.ready.gov/floods)) | หลีกเลี่ยงการเดินหรือขับรถผ่านน้ำท่วม | Avoid walking or driving through flood water. |
| คำแนะนำระหว่างรอ 2 ([ที่มา](https://www.ready.gov/floods)) | หากติดในอาคาร ให้ขึ้นไปยังจุดสูงที่ปลอดภัยและส่งสัญญาณขอความช่วยเหลือ | If you are trapped in a building, go to the highest safe place and signal for help. |
| คำแนะนำระหว่างรอ 3 ([ที่มา](https://www.ready.gov/floods)) | อย่าสัมผัสอุปกรณ์ไฟฟ้าที่เปียกหรือขณะยืนอยู่ในน้ำ ปิดไฟเฉพาะเมื่อทำได้อย่างปลอดภัย | Do not touch electrical equipment if it is wet or while you are standing in water. Turn off the power only if it is safe to do so. |

## ไฟไหม้ / Fire (`FIRE`)

| ช่อง | ไทย | English |
|---|---|---|
| ชื่อประเภท | ไฟไหม้ | Fire |
| หัวข้อจำนวนคน | จำนวนผู้ติดค้าง | People trapped |
| คำถาม `fireLocation` | ลักษณะสถานที่เกิดเพลิงไหม้ | Type of structure on fire |
| ตัวเลือก `fireLocation.HOUSE` | บ้านพักอาศัย / ทาวน์เฮาส์ | House / townhouse |
| ตัวเลือก `fireLocation.HIGH_RISE` | อาคารสูง / คอนโด / หอพัก | High-rise / apartment |
| ตัวเลือก `fireLocation.COMMERCIAL` | ร้านค้า / โกดัง / โรงงาน | Shop / warehouse / factory |
| ตัวเลือก `fireLocation.GRASS_FOREST` | หญ้า / ป่า / พื้นที่โล่ง | Grass / forest / open area |
| ตัวเลือก `fireLocation.VEHICLE` | ยานพาหนะ | Vehicle |
| คำถาม `buildingFloor` | ชั้นที่เกิดเหตุเพลิงไหม้ | Floor of fire incident |
| คำถาม `isTrappedInSmoke` | มีคนติดอยู่ในอาคารหรือกลุ่มควันไหม | Anyone trapped in building or smoke? |
| คำถาม `hasInjured` | มีผู้บาดเจ็บหรือสำลักควันไหม | Anyone burned or suffering smoke inhalation? |
| สัญญาณอันตราย `UNCONSCIOUS` | มีคนหมดสติ | Someone is unconscious |
| สัญญาณอันตราย `ABNORMAL_BREATHING` | มีคนหายใจผิดปกติ | Someone is breathing abnormally |
| สัญญาณอันตราย `SEVERE_BLEEDING` | มีคนเลือดออกมาก | Someone is bleeding heavily |
| สัญญาณอันตราย `CHEST_PAIN` | มีคนเจ็บหน้าอก | Someone has chest pain |
| สัญญาณอันตราย `TRAPPED_IN_FIRE` | มีคนติดอยู่ในกองไฟหรือควันหนาแน่น | Someone is trapped in the fire or thick smoke |
| คำแนะนำระหว่างรอ 1 ([ที่มา](https://www.disaster.go.th/apiv1/clickdownload/download/1606)) | หมอบคลานต่ำใต้กลุ่มควัน และใช้ผ้าชุบน้ำปิดจมูกและปาก | Crawl low beneath the smoke and cover your nose and mouth with a wet cloth. |
| คำแนะนำระหว่างรอ 2 ([ที่มา](https://www.disaster.go.th/apiv1/clickdownload/download/1606)) | ห้ามใช้ลิฟต์โดยเด็ดขาด ให้ใช้บันไดหนีไฟเพื่อออกจากอาคาร | Never use the elevator. Use the fire escape stairs to leave the building. |
| คำแนะนำระหว่างรอ 3 ([ที่มา](https://www.disaster.go.th/apiv1/clickdownload/download/1606)) | หากติดอยู่ในห้อง ให้ปิดประตู ใช้ผ้าชุบน้ำอุดตามช่องว่าง และส่งสัญญาณขอความช่วยเหลือที่หน้าต่าง | If you are trapped in a room, close the door, seal the gaps with wet cloth, and signal for help at the window. |

## อุบัติเหตุทางถนน / Road accident (`ROAD_ACCIDENT`)

| ช่อง | ไทย | English |
|---|---|---|
| ชื่อประเภท | อุบัติเหตุทางถนน | Road accident |
| หัวข้อจำนวนคน | จำนวนผู้บาดเจ็บหรือผู้ป่วย | Injured or sick people |
| คำถาม `vehicleTypes` | ประเภทยานพาหนะที่เกิดเหตุ | Vehicle types |
| ตัวเลือก `vehicleTypes.CAR` | รถยนต์ | Car |
| ตัวเลือก `vehicleTypes.MOTORCYCLE` | จักรยานยนต์ | Motorcycle |
| ตัวเลือก `vehicleTypes.TRUCK` | รถบรรทุก | Truck |
| ตัวเลือก `vehicleTypes.BUS` | รถโดยสาร | Bus |
| ตัวเลือก `vehicleTypes.OTHER` | อื่นๆ | Other |
| คำถาม `isTrapped` | มีคนติดค้างในยานพาหนะไหม | Anyone trapped in the vehicle? |
| คำถาม `injuredCount` | จำนวนผู้บาดเจ็บ | Number of injured people |
| สัญญาณอันตราย `UNCONSCIOUS` | มีคนหมดสติ | Someone is unconscious |
| สัญญาณอันตราย `ABNORMAL_BREATHING` | มีคนหายใจผิดปกติ | Someone is breathing abnormally |
| สัญญาณอันตราย `SEVERE_BLEEDING` | มีคนเลือดออกมาก | Someone is bleeding heavily |
| สัญญาณอันตราย `CHEST_PAIN` | มีคนเจ็บหน้าอก | Someone has chest pain |
| สัญญาณอันตราย `TRAPPED_IN_VEHICLE` | มีผู้ติดค้างอยู่ในยานพาหนะ | Someone is trapped inside a vehicle |
| คำแนะนำระหว่างรอ 1 ([ที่มา](https://ddc.moph.go.th/odpc7/news.php?deptcode=odpc7&news=23085)) | ห้ามเคลื่อนย้ายผู้บาดเจ็บเองโดยไม่จำเป็น เพราะอาจทำให้กระดูกคอหรือไขสันหลังบาดเจ็บรุนแรงขึ้น | Do not move the injured person yourself unless necessary, as it may make neck or spinal injuries worse. |
| คำแนะนำระหว่างรอ 2 ([ที่มา](https://ddc.moph.go.th/odpc7/news.php?deptcode=odpc7&news=23085)) | เปิดไฟฉุกเฉินหรือวางสิ่งกีดขวางเตือนระยะไกล ป้องกันการเกิดอุบัติเหตุซ้ำซ้อน | Turn on hazard lights or place warning objects far ahead to prevent another accident. |
| คำแนะนำระหว่างรอ 3 ([ที่มา](https://ddc.moph.go.th/odpc7/news.php?deptcode=odpc7&news=23085)) | ดับเครื่องยนต์ และห้ามสูบบุหรี่หรือจุดไฟในบริเวณที่เกิดเหตุเด็ดขาด | Turn off the engine, and never smoke or light a fire at the scene. |

## เจ็บป่วยฉุกเฉิน / Medical emergency (`MEDICAL`)

| ช่อง | ไทย | English |
|---|---|---|
| ชื่อประเภท | เจ็บป่วยฉุกเฉิน | Medical emergency |
| หัวข้อจำนวนคน | จำนวนผู้บาดเจ็บหรือผู้ป่วย | Injured or sick people |
| คำถาม `symptomGroup` | อาการสำคัญของผู้ป่วย | Primary symptom |
| ตัวเลือก `symptomGroup.BREATHING` | หายใจลำบาก / หอบเหนื่อย | Difficulty breathing |
| ตัวเลือก `symptomGroup.CHEST_HEART` | เจ็บแน่นหน้าอก / โรคหัวใจ | Chest pain / heart condition |
| ตัวเลือก `symptomGroup.STROKE_SEIZURE` | แขนขาอ่อนแรง / ชัก / ซึมลง | Weakness / seizure / drowsiness |
| ตัวเลือก `symptomGroup.INJURY_BLEEDING` | บาดแผล / เลือดออก / กระดูกหัก | Wound / bleeding / fracture |
| ตัวเลือก `symptomGroup.OTHER_SYMPTOM` | อาการเจ็บป่วยฉุกเฉินอื่นๆ | Other emergency symptom |
| คำถาม `patientCount` | จำนวนผู้ป่วยที่ต้องนำส่ง | Number of patients |
| คำถาม `hasChronicCondition` | มีโรคประจำตัวที่ต้องแจ้งทีมกู้ชีพไหม | Any chronic condition to inform EMS? |
| สัญญาณอันตราย `UNCONSCIOUS` | มีคนหมดสติ | Someone is unconscious |
| สัญญาณอันตราย `ABNORMAL_BREATHING` | มีคนหายใจผิดปกติ | Someone is breathing abnormally |
| สัญญาณอันตราย `SEVERE_BLEEDING` | มีคนเลือดออกมาก | Someone is bleeding heavily |
| สัญญาณอันตราย `CHEST_PAIN` | มีคนเจ็บหน้าอก | Someone has chest pain |
| สัญญาณอันตราย `CRITICAL_MEDICAL_EMERGENCY` | หมดสติ ปลุกไม่ตื่น หยุดหายใจ หรือเขียวคล้ำ | Unconscious, cannot be woken, not breathing, or turning blue |
| คำแนะนำระหว่างรอ 1 ([ที่มา](https://www.niems.go.th/1/UploadAttachFile/2025/EBook/410634_20250717133908.pdf)) | จัดผู้ป่วยให้นอนนิ่งๆ ในที่อากาศถ่ายเทสะดวก หากหมดสติแต่หายใจให้จัดท่านอนตะแคงกึ่งคว่ำ | Keep the patient lying still in a well-ventilated place. If they are unconscious but breathing, place them in the recovery position (on their side). |
| คำแนะนำระหว่างรอ 2 ([ที่มา](https://www.niems.go.th/1/UploadAttachFile/2025/EBook/410634_20250717133908.pdf)) | หากผู้ป่วยหยุดหายใจหรือไม่รู้สึกตัว ให้เริ่มทำ CPR กดหน้าอกทันทีตามคำแนะนำของเจ้าหน้าที่ 1669 | If the patient stops breathing or is unresponsive, start CPR chest compressions right away, following the instructions of the 1669 operator. |
| คำแนะนำระหว่างรอ 3 ([ที่มา](https://www.niems.go.th/1/UploadAttachFile/2025/EBook/410634_20250717133908.pdf)) | ห้ามป้อนน้ำ ยา หรืออาหารแก่ผู้ป่วยที่หมดสติหรือซึมลงโดยเด็ดขาด | Never give water, medicine, or food to a patient who is unconscious or becoming drowsy. |

## ตกน้ำ / จมน้ำ / Fell into water / drowning (`WATER_RESCUE`)

| ช่อง | ไทย | English |
|---|---|---|
| ชื่อประเภท | ตกน้ำ / จมน้ำ | Fell into water / drowning |
| หัวข้อจำนวนคน | จำนวนผู้ติดค้าง | People trapped |
| คำถาม `victimsInWater` | จำนวนคนที่ตกน้ำหรือติดอยู่ในน้ำ | Number of people in water |
| คำถาม `waterBodyType` | ลักษณะแหล่งน้ำ | Type of water body |
| ตัวเลือก `waterBodyType.CANAL_RIVER` | คลอง / แม่น้ำ | Canal / river |
| ตัวเลือก `waterBodyType.POND_POOL` | บ่อน้ำ / สระน้ำ | Pond / pool |
| ตัวเลือก `waterBodyType.FLOOD_CURRENT` | น้ำหลาก / กระแสน้ำเชี่ยว | Flash flood / strong current |
| ตัวเลือก `waterBodyType.SEA` | ทะเล / ชายฝั่ง | Sea / coast |
| คำถาม `isFloatingVisible` | ยังมองเห็นตัวผู้ประสบภัยเหนือน้ำไหม | Is the person still visible above water? |
| คำถาม `submersionDuration` | จมหายไปนานเท่าใดโดยประมาณ | Estimated time underwater |
| ตัวเลือก `submersionDuration.UNDER_5_MIN` | ไม่เกิน 5 นาที | Under 5 minutes |
| ตัวเลือก `submersionDuration.5_TO_15_MIN` | 5–15 นาที | 5–15 minutes |
| ตัวเลือก `submersionDuration.OVER_15_MIN` | มากกว่า 15 นาที | Over 15 minutes |
| ตัวเลือก `submersionDuration.UNKNOWN` | ไม่ทราบเวลาแน่ชัด | Unknown time |
| สัญญาณอันตราย `UNCONSCIOUS` | มีคนหมดสติ | Someone is unconscious |
| สัญญาณอันตราย `ABNORMAL_BREATHING` | มีคนหายใจผิดปกติ | Someone is breathing abnormally |
| สัญญาณอันตราย `SEVERE_BLEEDING` | มีคนเลือดออกมาก | Someone is bleeding heavily |
| สัญญาณอันตราย `CHEST_PAIN` | มีคนเจ็บหน้าอก | Someone has chest pain |
| สัญญาณอันตราย `PERSON_IN_WATER` | มีคนอยู่ในน้ำหรือจมหายไป | Someone is in the water or has gone under |
| คำแนะนำระหว่างรอ 1 ([ที่มา](https://ddc.moph.go.th/odpc7/news.php?deptcode=odpc7&news=35920)) | ใช้หลัก ตะโกน โยน ยื่น — ตะโกนขอความช่วยเหลือ โยนสิ่งของที่ลอยน้ำได้ หรือยื่นไม้ยาว/เชือกให้เกาะ | Follow "Shout, Throw, Reach": shout for help, throw something that floats, or reach out a long pole or rope for them to hold. |
| คำแนะนำระหว่างรอ 2 ([ที่มา](https://ddc.moph.go.th/odpc7/news.php?deptcode=odpc7&news=35920)) | ห้ามกระโดดลงน้ำไปช่วยเองโดยเด็ดขาด หากไม่ได้รับการฝึกฝน เพราะอาจถูกกอดจมน้ำไปด้วยกัน | Never jump into the water to rescue someone unless you are trained, because they may grab you and pull you under too. |
| คำแนะนำระหว่างรอ 3 ([ที่มา](https://ddc.moph.go.th/odpc7/news.php?deptcode=odpc7&news=35920)) | เมื่อช่วยขึ้นมาได้และหมดสติไม่หายใจ ให้รีบทำ CPR กดหน้าอกทันทีพร้อมโทร 1669 | Once the person is out of the water, if they are unconscious and not breathing, start CPR chest compressions immediately and call 1669. |

## อาคารถล่ม / ติดใต้ซาก / Building collapse / trapped under debris (`COLLAPSE`)

| ช่อง | ไทย | English |
|---|---|---|
| ชื่อประเภท | อาคารถล่ม / ติดใต้ซาก | Building collapse / trapped under debris |
| หัวข้อจำนวนคน | จำนวนผู้ติดค้าง | People trapped |
| คำถาม `collapseType` | ลักษณะการถล่ม | Collapse type |
| ตัวเลือก `collapseType.BUILDING_ROOF` | หลังคา / โครงสร้างอาคารทรุดตัว | Roof / building structure collapse |
| ตัวเลือก `collapseType.WALL_FENCE` | กำแพง / ผนังพังทับ | Wall / fence collapse |
| ตัวเลือก `collapseType.LANDSLIDE` | ดินโคลนถล่มทับบ้าน | Landslide / mudslide |
| ตัวเลือก `collapseType.SCAFFOLD_CRANE` | นั่งร้าน / เขตก่อสร้างถล่ม | Scaffolding / construction collapse |
| คำถาม `isTrappedUnderDebris` | มีคนติดอยู่ใต้ซากปรักหักพังไหม | Anyone trapped under debris? |
| คำถาม `trappedCount` | จำนวนคนที่คาดว่าติดใต้ซาก | Estimated number of people trapped |
| คำถาม `hasInjured` | มีผู้บาดเจ็บไหม | Anyone injured? |
| สัญญาณอันตราย `UNCONSCIOUS` | มีคนหมดสติ | Someone is unconscious |
| สัญญาณอันตราย `ABNORMAL_BREATHING` | มีคนหายใจผิดปกติ | Someone is breathing abnormally |
| สัญญาณอันตราย `SEVERE_BLEEDING` | มีคนเลือดออกมาก | Someone is bleeding heavily |
| สัญญาณอันตราย `CHEST_PAIN` | มีคนเจ็บหน้าอก | Someone has chest pain |
| สัญญาณอันตราย `TRAPPED_UNDER_DEBRIS` | มีคนติดอยู่ใต้ซากอาคารหรือดินถล่ม | Someone is trapped under building debris or a landslide |
| คำแนะนำระหว่างรอ 1 ([ที่มา](https://www.ddc.moph.go.th/uploads/publish/1666520250113085031.pdf)) | ประเมินความปลอดภัยก่อนเข้าช่วย ระวังโครงสร้างทรุดตัวซ้ำ เสาไฟ หรือสายไฟที่ขาด | Check that it is safe before helping. Watch for further collapse, electric poles, or broken power lines. |
| คำแนะนำระหว่างรอ 2 ([ที่มา](https://www.ddc.moph.go.th/uploads/publish/1666520250113085031.pdf)) | หากติดใต้ซาก ให้ใช้ผ้าปิดจมูกและปาก เคาะท่อหรือผนังเป็นจังหวะเพื่อให้สัญญาณ หลีกเลี่ยงการตะโกนต่อเนื่องเพื่อไม่ให้สูดฝุ่น | If you are trapped under debris, cover your nose and mouth with cloth and tap on a pipe or wall in a rhythm to signal. Avoid shouting continuously so you do not breathe in dust. |
| คำแนะนำระหว่างรอ 3 ([ที่มา](https://www.ddc.moph.go.th/uploads/publish/1666520250113085031.pdf)) | ห้ามจุดไฟแช็กหรือไม้ขีดไฟเด็ดขาด เพราะอาจมีแก๊สรั่วไหลใต้ซากปรักหักพัง | Never light a lighter or a match, because gas may be leaking under the debris. |

## สัตว์อันตราย / Dangerous animal (`ANIMAL`)

| ช่อง | ไทย | English |
|---|---|---|
| ชื่อประเภท | สัตว์อันตราย | Dangerous animal |
| หัวข้อจำนวนคน | จำนวนคนที่ต้องการความช่วยเหลือ | People who need help |
| คำถาม `animalType` | ชนิดสัตว์อันตราย | Type of dangerous animal |
| ตัวเลือก `animalType.SNAKE` | งู | Snake |
| ตัวเลือก `animalType.MONITOR_LIZARD` | ตะกวด | Monitor lizard |
| ตัวเลือก `animalType.CROCODILE` | จระเข้ | Crocodile |
| ตัวเลือก `animalType.WASPS_BEES` | ต่อ / แตน / ผึ้งรังใหญ่ | Wasps / hornets / bees |
| ตัวเลือก `animalType.OTHER_ANIMAL` | สัตว์อันตรายอื่นๆ | Other dangerous animal |
| คำถาม `isInsideHome` | สัตว์ยังอยู่ในบ้านหรือพื้นที่ปิดไหม | Is the animal still inside the house? |
| คำถาม `hasBittenOrStung` | มีคนถูกกัดหรือต่อยไหม | Has anyone been bitten or stung? |
| สัญญาณอันตราย `UNCONSCIOUS` | มีคนหมดสติ | Someone is unconscious |
| สัญญาณอันตราย `ABNORMAL_BREATHING` | มีคนหายใจผิดปกติ | Someone is breathing abnormally |
| สัญญาณอันตราย `SEVERE_BLEEDING` | มีคนเลือดออกมาก | Someone is bleeding heavily |
| สัญญาณอันตราย `CHEST_PAIN` | มีคนเจ็บหน้าอก | Someone has chest pain |
| สัญญาณอันตราย `VENOMOUS_BITE` | ถูกสัตว์มีพิษกัด/ต่อย และมีอาการแน่นหน้าอก หายใจลำบาก หรือบวมเฉียบพลัน | Bitten or stung by a venomous animal with chest tightness, difficulty breathing, or sudden swelling |
| คำแนะนำระหว่างรอ 1 ([ที่มา](https://ddc.moph.go.th/odpc3/news.php?deptcode=odpc3&news=29303)) | ถอยห่างจากสัตว์ ไม่พยายามจับหรือตีด้วยตนเอง และคอยสังเกตตำแหน่งจากระยะปลอดภัย | Move away from the animal. Do not try to catch or hit it yourself, and keep watching where it is from a safe distance. |
| คำแนะนำระหว่างรอ 2 ([ที่มา](https://ddc.moph.go.th/odpc3/news.php?deptcode=odpc3&news=29303)) | หากถูกงูกัด ให้ล้างแผลด้วยน้ำสะอาด ดามอวัยวะให้อยู่นิ่งระดับต่ำกว่าหัวใจ ห้ามขันชะเนาะและห้ามกรีดแผล | If bitten by a snake, wash the wound with clean water and splint the limb so it stays still below heart level. Do not apply a tourniquet and do not cut the wound. |
| คำแนะนำระหว่างรอ 3 ([ที่มา](https://ddc.moph.go.th/odpc3/news.php?deptcode=odpc3&news=29303)) | จดจำลักษณะ สี หรือถ่ายภาพสัตว์จากระยะปลอดภัยเพื่อช่วยแพทย์ในการเลือกเซรุ่มแก้พิษ | Remember the animal's appearance and color, or photograph it from a safe distance, to help doctors choose the right antivenom. |

## เหตุอื่นๆ / Other emergency (`OTHER`)

| ช่อง | ไทย | English |
|---|---|---|
| ชื่อประเภท | เหตุอื่นๆ | Other emergency |
| หัวข้อจำนวนคน | จำนวนคนที่ต้องการความช่วยเหลือ | People who need help |
| คำถาม `otherCategory` | ลักษณะเหตุที่ต้องการความช่วยเหลือ | Type of assistance needed |
| ตัวเลือก `otherCategory.TREE_FALLEN` | ต้นไม้ล้มทับบ้าน / ขวางทาง | Fallen tree on house / road |
| ตัวเลือก `otherCategory.ELECTRIC_HAZARD` | ไฟรั่ว / เสาไฟล้ม | Electrical leak / fallen pole |
| ตัวเลือก `otherCategory.STRANDED` | ติดค้างต้องการความช่วยเหลือ | Stranded / needs evacuation |
| ตัวเลือก `otherCategory.GENERAL` | เหตุฉุกเฉินอื่นๆ | Other emergency |
| คำถาม `otherDescription` | รายละเอียดเหตุเพิ่มเติม | Additional description |
| ตัวอย่าง `otherDescription` | พิมพ์รายละเอียดสั้นๆ ไม่เกิน 200 ตัวอักษร | Up to 200 characters |
| คำถาม `hasInjured` | มีผู้บาดเจ็บไหม | Anyone injured? |
| สัญญาณอันตราย `UNCONSCIOUS` | มีคนหมดสติ | Someone is unconscious |
| สัญญาณอันตราย `ABNORMAL_BREATHING` | มีคนหายใจผิดปกติ | Someone is breathing abnormally |
| สัญญาณอันตราย `SEVERE_BLEEDING` | มีคนเลือดออกมาก | Someone is bleeding heavily |
| สัญญาณอันตราย `CHEST_PAIN` | มีคนเจ็บหน้าอก | Someone has chest pain |
| สัญญาณอันตราย `SEVERE_HAZARD` | มีอันตรายร้ายแรงต่อชีวิตหรือสารเคมีอันตราย | Serious danger to life or hazardous chemicals |
| คำแนะนำระหว่างรอ 1 ([ที่มา](https://www.niems.go.th/1/UploadAttachFile/2025/EBook/410634_20250717133908.pdf)) | ตั้งสติ อยู่ในพื้นที่ปลอดภัย และแจ้งข้อมูลตำแหน่งและสถานการณ์แก่เจ้าหน้าที่อย่างชัดเจน | Stay calm, stay in a safe area, and clearly tell the responders your location and the situation. |
| คำแนะนำระหว่างรอ 2 ([ที่มา](https://www.niems.go.th/1/UploadAttachFile/2025/EBook/410634_20250717133908.pdf)) | หากมีผู้บาดเจ็บ ให้สังเกตสัญญาณชีพและอาการ ห้ามเคลื่อนย้ายผู้บาดเจ็บหากไม่จำเป็น | If someone is injured, watch their vital signs and symptoms. Do not move the injured person unless necessary. |
| คำแนะนำระหว่างรอ 3 ([ที่มา](https://www.niems.go.th/1/UploadAttachFile/2025/EBook/410634_20250717133908.pdf)) | หากมีสายไฟขาดหรือวัตถุอันตราย ให้อยู่ห่างอย่างน้อย 8–10 เมตร และกันผู้อื่นออกจากพื้นที่ | If there are broken power lines or hazardous objects, stay at least 8–10 meters away and keep others out of the area. |

## ระดับน้ำ (`WaterLevel`)

| รหัส | ไทย | English |
|---|---|---|
| `ROOF` | บนหลังคา / ดาดฟ้า | On the roof / rooftop |
| `FIRST_FLOOR` | ท่วมชั้น 1 (อยู่ชั้น 2) | Ground floor flooded (I'm upstairs) |
| `WAIST_CHEST` | ระดับเอว–หน้าอก | Waist to chest deep |
| `ANKLE_KNEE` | ระดับข้อเท้า–เข่า | Ankle to knee deep |
| `SURROUNDED` | ถูกน้ำล้อม / ตัดขาด | Surrounded by water / cut off |

## สิ่งที่ต้องการ (`Need`)

| รหัส | ไทย | English |
|---|---|---|
| `EVACUATION_BOAT` | เรืออพยพด่วน | Urgent evacuation boat |
| `EVACUATE_BEDRIDDEN` | อพยพผู้ป่วยติดเตียง/คนชรา | Evacuate bedridden / elderly people |
| `DRINKING_WATER` | น้ำดื่มสะอาด | Clean drinking water |
| `FOOD` | อาหาร/ข้าวกล่อง | Food / meal boxes |
| `MEDICINE` | ยารักษาโรค/ปฐมพยาบาล | Medicine / first aid |
| `BABY_SUPPLIES` | ผ้าอ้อม/นมผง | Diapers / baby formula |
| `FLASHLIGHT_POWER` | ไฟฉาย/พาวเวอร์แบงก์ | Flashlight / power bank |
| `LIFE_JACKET` | เสื้อชูชีพ/เชือก | Life jacket / rope |
| `PET_FOOD` | อาหารสัตว์เลี้ยง | Pet food |
| `CUT_POWER` | ตัดไฟด่วน (ไฟรั่ว) | Cut the power urgently (electric leak) |
| `OTHER` | อื่นๆ (พิมพ์เอง) | Other (type it in) |
